/** Single non-personal session flag. Never stores user text or identifiers. */
export const GPU_FAIL_FLAG = "jane.webgpu.failed";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let memoryGpuFailed = false;

function defaultStore(): StorageLike | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch { /* private mode / node */ }
  return null;
}

function textOf(err: unknown): string {
  if (err instanceof Error) return `${err.name} ${err.message}`;
  if (err && typeof err === "object") {
    const o = err as { name?: unknown; message?: unknown; reason?: unknown };
    return [o.name, o.message, o.reason].filter((x) => x != null).join(" ");
  }
  return String(err ?? "");
}

/** GPUDevice.lost, WebLLM worker drop, and a disposed engine are all a dead WebGPU runtime. */
export function isWebGpuRuntimeFailure(err: unknown): boolean {
  const s = textOf(err).toLowerCase();
  return s.includes("device was lost")
    || s.includes("gpudevicelost")
    || s.includes("disposed")
    || s.includes("instance dropped")
    || s.includes("poperrorscope")
    || s.includes("valid external instance");
}

export function gpuFailedThisSession(store?: StorageLike): boolean {
  if (memoryGpuFailed) return true;
  try {
    return (store ?? defaultStore())?.getItem(GPU_FAIL_FLAG) === "1";
  } catch {
    return memoryGpuFailed;
  }
}

export function rememberGpuFailure(store?: StorageLike): void {
  memoryGpuFailed = true;
  try {
    (store ?? defaultStore())?.setItem(GPU_FAIL_FLAG, "1");
  } catch { /* memory only */ }
}

export function clearGpuFailureForTests(store?: StorageLike): void {
  memoryGpuFailed = false;
  try {
    (store ?? defaultStore())?.removeItem(GPU_FAIL_FLAG);
  } catch { /* ignore */ }
}
