/**
 * Embedding-matcher seam. The shipped router is rules (crisis first, then trigger
 * retrieval, then the fallback card). A matcher is injected only when the desktop-dev
 * flag is on; phones never get one. This file is the flag + interface only — no weights.
 */

export type MatcherDecision =
  | { kind: "card"; cardId: string }
  | { kind: "abstain" };

export interface IntentMatcher {
  match(text: string): Promise<MatcherDecision>;
}

/** Always abstain. Used when the flag is on but no local weights (or as a test double). */
export const noopMatcher: IntentMatcher = {
  async match() {
    return { kind: "abstain" };
  },
};

const MOBILE_UA = /iphone|ipod|ipad|android|webos|blackberry|iemobile|opera mini|(?:^|[^a-z])mobile(?:[^a-z]|$)/i;

export function isMobileUserAgent(ua: string): boolean {
  return MOBILE_UA.test(ua);
}

/**
 * URL override: ?matcher=1|on|true enables, ?matcher=0|off|false disables. Otherwise the config flag.
 * Production builds (`isDev` false) never honour the URL or the config flag — same pattern as quiz.ts `?copy=`.
 */
export function readMatcherFlag(configFlag: boolean, search: string, isDev: boolean = import.meta.env.DEV): boolean {
  if (!isDev) return false;
  const q = search.startsWith("?") ? search.slice(1) : search;
  const v = (new URLSearchParams(q).get("matcher") ?? "").toLowerCase();
  if (v === "0" || v === "off" || v === "false") return false;
  if (v === "1" || v === "on" || v === "true") return true;
  return configFlag;
}

/** True only in DEV, when the flag is on, and the user agent is not a phone / tablet. Production never enables. */
export function matcherEnabled(flag: boolean, userAgent: string, isDev: boolean = import.meta.env.DEV): boolean {
  return isDev && flag && !isMobileUserAgent(userAgent);
}

const DEFAULT_DIR = "models/matcher";

/**
 * Same-origin, gitignored asset dir only. Remote URLs, protocol-relative paths,
 * absolute paths and `..` traversal are rejected. Missing param → models/matcher.
 */
export function localMatcherDir(search: string): string | null {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(q).get("matcherWeights");
  if (raw == null || raw === "") return DEFAULT_DIR;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  if (raw.startsWith("//") || raw.startsWith("/") || raw.includes("\\") || raw.includes("..")) return null;
  if (/[?#]/.test(raw)) return null;
  if (!raw.startsWith("models/") || raw === "models/") return null;
  return raw.replace(/\/+$/, "");
}
