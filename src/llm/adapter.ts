import type { Intent, IntentResult } from "../core/types";
import { classifyNeed } from "../core/intent";
import { detectCrisis } from "../core/crisis";

/**
 * Interface for an optional in-browser model (WebLLM / wllama). The deterministic rules are always
 * the fallback: if the adapter is missing, slow, throws, or returns something invalid, rules win.
 * Safety (crisis detection) is never delegated to the model.
 */
export interface LLMAdapter {
  readonly name: string;
  ready(): boolean;
  /** Return ranked intents, or null to defer to rules. Must not do network I/O after model cache. */
  classify(text: string, signal: AbortSignal): Promise<Intent[] | null>;
  /** Rephrase the template summary. Must keep the 6-line template; may only reword her own words. */
  polishSummary(draft: string, signal: AbortSignal): Promise<string | null>;
}

export const VALID_INTENTS: readonly Intent[] = ["pregnancy", "emergency_contraception", "contraception",
  "sti_hiv", "relationship_consent", "mental_health", "violence", "other"];

async function withTimeout<T>(fn: (s: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await Promise.race([fn(ac.signal), new Promise<null>((r) => ac.signal.addEventListener("abort", () => r(null)))]);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function classifyWithFallback(text: string, adapter: LLMAdapter | null, timeoutMs = 4000): Promise<IntentResult> {
  const rules = classifyNeed(text);
  if (!adapter || !adapter.ready()) return rules;
  const out = await withTimeout((s) => adapter.classify(text, s), timeoutMs);
  const clean = (out ?? []).filter((i) => VALID_INTENTS.includes(i)).slice(0, 3);
  return clean.length ? { intents: clean, scores: rules.scores, source: "model" } : rules;
}

/** Validates model output: same line count/prefixes as the template, no new crisis or PII-like content. */
export function acceptPolished(draft: string, polished: string | null): string {
  if (!polished) return draft;
  const a = draft.split("\n"), b = polished.trim().split("\n");
  if (a.length !== b.length) return draft;
  const prefixes = a.map((l) => l.split(":")[0]);
  if (!b.every((l, i) => l.startsWith(prefixes[i]))) return draft;
  if (/\d{3,}|@|https?:/.test(polished) && !/\d{3,}|@|https?:/.test(draft)) return draft;
  if (detectCrisis(polished).crisis && !detectCrisis(draft).crisis) return draft;
  return polished;
}

export async function polishWithFallback(draft: string, adapter: LLMAdapter | null, timeoutMs = 6000): Promise<string> {
  if (!adapter || !adapter.ready()) return draft;
  const out = await withTimeout((s) => adapter.polishSummary(draft, s), timeoutMs);
  return acceptPolished(draft, out);
}

/** Default for milestone 1: no model. */
export const NO_MODEL: LLMAdapter | null = null;
