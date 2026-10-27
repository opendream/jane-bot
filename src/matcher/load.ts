import { localMatcherDir, noopMatcher, type IntentMatcher } from "../core/matcher";

/**
 * Unique marker for the default-bundle test. This module is loaded only via
 * dynamic import() after the matcher flag is on and the UA is not a phone.
 * Do not statically import it from the app entry.
 */
export const MATCHER_IMPL_ID = "JANE_MATCHER_E5_SMALL_INT8";

/**
 * Desktop-dev seam: probe a local, user-supplied models/ dir (gitignored, never
 * committed). The e5-small int8 runtime is not shipped; with or without weights
 * this returns the no-op matcher (abstain → existing fallback).
 */
export async function loadMatcher(opts: {
  search?: string;
  probe?: (dir: string) => Promise<boolean>;
} = {}): Promise<IntentMatcher> {
  const dir = localMatcherDir(opts.search ?? "");
  if (!dir) return noopMatcher;
  const probe = opts.probe ?? defaultProbe;
  try {
    await probe(dir);
  } catch {
    /* missing local dir: stay no-op; never throw into chat */
  }
  return noopMatcher;
}

/** Same-origin HEAD of models/.../head.json. No remote hosts. */
async function defaultProbe(dir: string): Promise<boolean> {
  if (typeof fetch !== "function" || typeof document === "undefined") return false;
  const url = new URL(`${dir.replace(/\/$/, "")}/head.json`, document.baseURI);
  if (url.origin !== new URL(document.baseURI).origin) return false;
  try {
    const r = await fetch(url.href, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}
