import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PICK_MAX_TOKENS, PICK_SYSTEM, parsePick, pickSchema, pickUser } from "../../../src/llm/prompts";

export interface PickRequest {
  text: string;
  shortlist: { id: string; title_th: string; key_fact?: string }[];
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
    shortlist: { id: string; title_th: string; key_fact?: string }[],
    prev: string | null,
    signal?: AbortSignal,
  ): Promise<PickResponse>;
  close?(): Promise<void> | void;
  configure?(opts: { describe?: boolean }): void;
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

export interface LlamaPickerOpts {
  modelPath?: string;
  threads?: number;
  /** Test-only: replace the python worker argv (no GGUF required). */
  workerArgv?: string[];
  workerEnv?: NodeJS.ProcessEnv;
}

/**
 * Native llama.cpp picker. Request ids isolate waiters so a timed-out pick cannot
 * resolve the next query.
 */
export function llamaPicker(opts: LlamaPickerOpts = {}): EvalPicker {
  const threads = opts.threads ?? Math.max(1, Number(process.env.JANE_THREADS) || os.cpus().length);
  const modelPath = opts.workerArgv ? (opts.modelPath ?? "mock") : (opts.modelPath ?? findVerifiedGguf());
  if (!opts.workerArgv && !modelPath) {
    throw new Error("Qwen3-1.7B GGUF is not present locally (see scripts/fetch-weights.mjs --variants wasm)");
  }
  const argv = opts.workerArgv ?? ["python3", workerPath(), "--model", modelPath!, "--threads", String(threads)];
  let proc: ChildProcessWithoutNullStreams | null = null;
  let buf = "";
  let seq = 0;
  let pendingId: number | null = null;
  let pending: ((v: PickResponse) => void) | null = null;
  let pendingErr: ((e: Error) => void) | null = null;

  const clearWaiter = (id: number | null) => {
    if (id != null && pendingId !== id) return;
    pendingId = null;
    pending = null;
    pendingErr = null;
  };

  const start = () => {
    if (proc) return;
    proc = spawn(argv[0], argv.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1", ...opts.workerEnv },
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
        const rid = parsed?.req_id ?? parsed?.id;
        if (rid != null && pendingId != null && rid !== pendingId) continue;
        const ok = pending;
        const err = pendingErr;
        pendingId = null;
        pending = null;
        pendingErr = null;
        if (parsed?.error) err?.(new Error(String(parsed.error)));
        else ok?.(parsed as PickResponse);
      }
    });
    proc.stderr.on("data", () => { /* llama.cpp logs; do not print user text */ });
    proc.on("exit", (code) => {
      const err = pendingErr;
      pendingId = null;
      pending = null;
      pendingErr = null;
      err?.(new Error(`llama_worker exited ${code}`));
      proc = null;
    });
  };

  return {
    name: opts.workerArgv ? `mock-llama-worker:t${threads}` : `llama.cpp:Qwen3-1.7B-Q4_K_M:t${threads}`,
    async pick(text, shortlist, prev, signal) {
      start();
      const reqId = ++seq;
      const schema = pickSchema(shortlist.map((s) => s.id));
      const user = `${pickUser(text, shortlist, prev)} /no_think`;
      const payload = JSON.stringify({
        req_id: reqId,
        system: PICK_SYSTEM,
        user,
        schema,
        max_tokens: PICK_MAX_TOKENS,
      });
      const result = await new Promise<PickResponse>((resolve, reject) => {
        if (signal?.aborted) return reject(new Error("aborted"));
        const onAbort = () => {
          clearWaiter(reqId);
          signal?.removeEventListener("abort", onAbort);
          reject(new Error("aborted"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        pendingId = reqId;
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
      pendingId = null;
      pending = null;
      pendingErr = null;
    },
  };
}
