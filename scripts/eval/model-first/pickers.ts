import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PICK_MAX_TOKENS, PICK_SYSTEM, parsePick, pickSchema, pickUser } from "../../../src/llm/prompts";

export interface PickRequest {
  text: string;
  shortlist: { id: string; title_th: string }[];
  previousTitle: string | null;
}

export interface PickResponse {
  id: string | null;
  raw: string;
  latencyMs: number;
  promptTokens: number;
}

export interface EvalPicker {
  name: string;
  pick(
    text: string,
    shortlist: { id: string; title_th: string }[],
    prev: string | null,
    signal?: AbortSignal,
  ): Promise<PickResponse>;
  close?(): Promise<void> | void;
}

export type StubMode = "top1" | "always-other" | "forced-index";

export function stubPicker(mode: StubMode, index = 0): EvalPicker {
  return {
    name: mode === "forced-index" ? `stub:forced-index:${index}` : `stub:${mode}`,
    async pick(_text, shortlist) {
      const t0 = Date.now();
      let id: string | null = null;
      if (mode === "top1") id = shortlist[0]?.id ?? null;
      else if (mode === "always-other") id = shortlist[1]?.id ?? null;
      else id = shortlist[index]?.id ?? null;
      const raw = JSON.stringify({ id: id ?? "none" });
      return { id, raw, latencyMs: Math.max(0, Date.now() - t0), promptTokens: 0 };
    },
  };
}

export const QWEN17_GGUF_SHA256 = "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897";
export const QWEN17_GGUF_REL = "gguf/Qwen3-1.7B-Q4_K_M.gguf";

export function defaultGgufPath(): string {
  const env = process.env.JANE_GGUF;
  if (env) return path.resolve(env);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../models", QWEN17_GGUF_REL);
}

export function sha256FileSync(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function findVerifiedGguf(): string | null {
  const p = defaultGgufPath();
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  const got = sha256FileSync(p);
  if (got !== QWEN17_GGUF_SHA256) {
    throw new Error(`GGUF sha256 mismatch at ${p}: got ${got}, expected ${QWEN17_GGUF_SHA256}`);
  }
  return p;
}

function workerPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "llama_worker.py");
}

/** Native llama.cpp (llama-cpp-python) picker. Only constructed when a verified GGUF is on disk. */
export function llamaPicker(opts: { modelPath?: string; threads?: number } = {}): EvalPicker {
  const modelPath = opts.modelPath ?? findVerifiedGguf();
  if (!modelPath) throw new Error("Qwen3-1.7B GGUF is not present locally (see scripts/fetch-weights.mjs --variants wasm)");
  const threads = opts.threads ?? Math.max(1, Number(process.env.JANE_THREADS) || os.cpus().length);
  let proc: ChildProcessWithoutNullStreams | null = null;
  let buf = "";
  let pending: ((v: PickResponse) => void) | null = null;
  let pendingErr: ((e: Error) => void) | null = null;

  const start = () => {
    if (proc) return;
    proc = spawn("python3", [workerPath(), "--model", modelPath, "--threads", String(threads)], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let parsed: any;
        try { parsed = JSON.parse(line); } catch { continue; }
        if (parsed?.ready) continue;
        const ok = pending;
        pending = null;
        const err = pendingErr;
        pendingErr = null;
        if (parsed?.error) err?.(new Error(String(parsed.error)));
        else ok?.(parsed as PickResponse);
      }
    });
    proc.stderr.on("data", () => { /* llama.cpp logs; do not print user text */ });
    proc.on("exit", (code) => {
      const err = pendingErr;
      pending = null;
      pendingErr = null;
      err?.(new Error(`llama_worker exited ${code}`));
      proc = null;
    });
  };

  return {
    name: `llama.cpp:Qwen3-1.7B-Q4_K_M:t${threads}`,
    async pick(text, shortlist, prev, signal) {
      start();
      const schema = pickSchema(shortlist.map((s) => s.id));
      const user = `${pickUser(text, shortlist, prev)} /no_think`;
      const payload = JSON.stringify({
        system: PICK_SYSTEM,
        user,
        schema,
        max_tokens: PICK_MAX_TOKENS,
      });
      const result = await new Promise<PickResponse>((resolve, reject) => {
        if (signal?.aborted) return reject(new Error("aborted"));
        const onAbort = () => reject(new Error("aborted"));
        signal?.addEventListener("abort", onAbort, { once: true });
        pending = (v) => { signal?.removeEventListener("abort", onAbort); resolve(v); };
        pendingErr = (e) => { signal?.removeEventListener("abort", onAbort); reject(e); };
        proc!.stdin.write(payload + "\n");
      });
      const id = parsePick(result.raw ?? "", shortlist.map((s) => s.id));
      return { ...result, id };
    },
    close() {
      try { proc?.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n"); } catch { /* ignore */ }
      proc?.kill();
      proc = null;
    },
  };
}
