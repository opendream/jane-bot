/**
 * Dev-test arm manifest types and validation. Imported only from src/dev (dropped in production).
 * No model family names live here — ids come from the local Elsa-side manifest.
 */

export const MAX_BLOB_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB (wllama #204)
export const MAX_ARM_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB phone cap
export const ARM_ID_RE = /^[A-F]-(base|tuned)$/;
export const LAST_ARM_KEY = "jane.devtest.arm";
export const DEVTEST_WEIGHTS_CACHE = "devtest-weights-v1";
export const ARMS_URL = "models/devtest/arms.json";

export type ArmId = `${"A" | "B" | "C" | "D" | "E" | "F"}-${"base" | "tuned"}`;

export interface ArmEntry {
  id: string;
  label: string;
  files: string[];
  bytes: number;
  sha256: string;
  phone_ready: boolean;
  note?: string;
  not_ready_reason?: string;
  blob_bytes?: number[];
}

export interface ArmManifest {
  generated?: string;
  arms: ArmEntry[];
}

export type ArmParam =
  | { kind: "none" }
  | { kind: "off" }
  | { kind: "id"; id: ArmId };

export function parseArmParam(search: string): ArmParam {
  let raw = "";
  try {
    const q = search.startsWith("?") ? search.slice(1) : search;
    raw = (new URLSearchParams(q).get("arm") ?? "").trim();
  } catch { /* node unit tests */ }
  if (!raw) return { kind: "none" };
  if (raw.toLowerCase() === "off") return { kind: "off" };
  if (ARM_ID_RE.test(raw)) return { kind: "id", id: raw as ArmId };
  return { kind: "off" }; // unknown / malformed → rules
}

export function isArmId(id: string): id is ArmId {
  return ARM_ID_RE.test(id);
}

export function shaOk(sha: string): boolean {
  return /^[0-9a-f]{64}$/i.test(sha);
}

/** Size / shard / sha checks. Does not read bytes off disk — the writer already hashed. */
export function assessArm(raw: Partial<ArmEntry> & { id?: string }): { phone_ready: boolean; not_ready_reason?: string } {
  const files = Array.isArray(raw.files) ? raw.files.filter((f) => typeof f === "string" && f.length > 0) : [];
  const bytes = Number(raw.bytes);
  const blobs = Array.isArray(raw.blob_bytes) ? raw.blob_bytes.map(Number) : files.length === 1 && Number.isFinite(bytes) ? [bytes] : [];
  if (!raw.id || !isArmId(raw.id)) return { phone_ready: false, not_ready_reason: "unknown arm id" };
  if (!files.length) return { phone_ready: false, not_ready_reason: "no files" };
  if (!shaOk(String(raw.sha256 ?? ""))) return { phone_ready: false, not_ready_reason: "sha256 missing or malformed" };
  if (!Number.isFinite(bytes) || bytes < 0) return { phone_ready: false, not_ready_reason: "size missing" };
  if (bytes > MAX_ARM_BYTES) return { phone_ready: false, not_ready_reason: "over 4 GiB, not phone-ready" };
  if (blobs.some((b) => b > MAX_BLOB_BYTES) || (files.length === 1 && bytes > MAX_BLOB_BYTES)) {
    return { phone_ready: false, not_ready_reason: "needs split (a blob is over 2 GiB)" };
  }
  return { phone_ready: true };
}

export function normalizeArm(raw: any): ArmEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "");
  const files = Array.isArray(raw.files) ? raw.files.map(String) : [];
  const bytes = Number(raw.bytes);
  const sha256 = String(raw.sha256 ?? "").toLowerCase();
  const blob_bytes = Array.isArray(raw.blob_bytes) ? raw.blob_bytes.map(Number) : undefined;
  const assessed = assessArm({ id, files, bytes, sha256, blob_bytes });
  const writerReady = raw.phone_ready === true;
  const phone_ready = writerReady && assessed.phone_ready;
  const note = typeof raw.note === "string" && raw.note ? raw.note : comparisonNote(id);
  return {
    id,
    label: typeof raw.label === "string" && raw.label ? raw.label : id,
    files,
    bytes: Number.isFinite(bytes) ? bytes : 0,
    sha256,
    phone_ready,
    ...(note ? { note } : {}),
    ...(!phone_ready ? { not_ready_reason: assessed.not_ready_reason ?? (writerReady ? "not phone-ready" : String(raw.not_ready_reason ?? "not phone-ready")) } : {}),
    ...(blob_bytes ? { blob_bytes } : {}),
  };
}

export function comparisonNote(id: string): string | undefined {
  const letter = id.slice(0, 1);
  if (letter === "C" || letter === "D") {
    return "comparison only — not distributed; owner must clear the licence before anything ships";
  }
  return undefined;
}

export function parseManifest(data: unknown): ArmManifest {
  const armsIn = data && typeof data === "object" && Array.isArray((data as any).arms) ? (data as any).arms : [];
  const arms = armsIn.map(normalizeArm).filter((a: ArmEntry | null): a is ArmEntry => !!a);
  const generated = data && typeof data === "object" && typeof (data as any).generated === "string" ? (data as any).generated : undefined;
  return { generated, arms };
}

export function findArm(manifest: ArmManifest, id: string): ArmEntry | undefined {
  return manifest.arms.find((a) => a.id === id);
}

export async function fetchArmsManifest(): Promise<ArmManifest> {
  try {
    const r = await fetch(new URL(ARMS_URL, document.baseURI), { cache: "no-store" });
    if (!r.ok) return { arms: [] };
    return parseManifest(await r.json());
  } catch {
    return { arms: [] };
  }
}

/** Arm mode defaults modelPick on, unless the URL already set it to 0/off/false. */
export function withArmModelPick(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(raw);
  if (!p.has("arm")) return search.startsWith("?") || !search ? search : `?${search}`;
  const v = (p.get("modelPick") ?? "").toLowerCase();
  if (v === "0" || v === "off" || v === "false") {
    return search.startsWith("?") || search === "" ? search : `?${search}`;
  }
  if (v !== "1" && v !== "on" && v !== "true") p.set("modelPick", "1");
  const q = p.toString();
  return q ? `?${q}` : "";
}

export function armSearch(current: string, arm: string): string {
  const raw = current.startsWith("?") ? current.slice(1) : current;
  const p = new URLSearchParams(raw);
  if (arm === "off") p.set("arm", "off");
  else p.set("arm", arm);
  if (arm !== "off") {
    const v = (p.get("modelPick") ?? "").toLowerCase();
    if (v !== "0" && v !== "off" && v !== "false") p.set("modelPick", "1");
  }
  return `?${p.toString()}`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${n} B`;
}

export function shaPrefix(sha: string, n = 8): string {
  return sha.slice(0, n);
}

export function rememberLastArm(id: string, store?: Pick<Storage, "setItem"> | null): void {
  try { (store ?? (typeof localStorage !== "undefined" ? localStorage : null))?.setItem(LAST_ARM_KEY, id); } catch { /* quota / private mode */ }
}

export function readLastArm(store?: Pick<Storage, "getItem"> | null): string | null {
  try { return (store ?? (typeof localStorage !== "undefined" ? localStorage : null))?.getItem(LAST_ARM_KEY) ?? null; } catch { return null; }
}
