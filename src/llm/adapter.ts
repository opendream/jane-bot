import type { Intent, IntentResult } from "../core/types";
import { classifyNeed } from "../core/intent";
import { detectCrisis } from "../core/crisis";
import type { ChatLang } from "./chat-lang";

/**
 * Extra chat-turn flags. Stays the 6th `chatReply` argument.
 * `ambiguous` adds the short AMBIGUOUS system line.
 * `grounding` is the approved card (or none) for the structured-choice chat path.
 */
export type ChatReplyOpts = {
  ambiguous?: boolean;
  grounding?: { facts: string | null; strict?: boolean };
};

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
  /** Where it runs (decides whether chat reword is on; see REWORD_RUNTIMES in config). */
  readonly runtime?: "webgpu" | "wasm";
  /** Remaining ms of the final warm-up stage; omit/null if not in that stage. */
  warmupRemainingMs?(): number | null;
  /** Chat: pick one id from the shortlist (raw model text; parsed and checked by the caller). */
  pickCard?(text: string, shortlist: { id: string; title_th: string; key_fact?: string }[], previousTitle: string | null, signal: AbortSignal): Promise<string | null>;
  /** Chat: reword one curated card. Output is validated by rewordGuard; failures show the exact text. */
  rewordCard?(card: { answer_th: string; key_facts: string[] }, signal: AbortSignal): Promise<string | null>;
  /**
   * Chat-first connective talk. Output is a JSON choice (opener / sentence
   * ids / follow-up), parsed strictly, then chatGuard on the list text.
   * History is PII-stripped, memory-only, and excludes crisis lines.
   * `groupId` is the generation token; a stale token must return without
   * generating. `opts` is the 6th argument (AMBIGUOUS flag plus the
   * approved-card grounding, or none).
   */
  chatReply?(
    text: string,
    history: { role: "user" | "assistant"; content: string }[],
    signal: AbortSignal,
    lang?: ChatLang,
    groupId?: number,
    opts?: ChatReplyOpts,
  ): Promise<string | null>;
  /** Tear down a worker / GPU engine. Used when WebGPU dies and we fall back. */
  dispose?(): void | Promise<void>;
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

/**
 * Merge policy:
 *  - Rules are confident (a strong phrase matched, score >= 2): use rules, don't wait for the model.
 *  - Otherwise ask the model (if ready) within the timeout; a valid answer wins, rules' other intents are kept as backups.
 *  - Model missing / slow / invalid: rules.
 * Crisis detection happens before this and never involves the model.
 */
export const CONFIDENT_SCORE = 2;
export async function classifyWithFallback(text: string, adapter: LLMAdapter | null, timeoutMs = 8000): Promise<IntentResult> {
  const rules = classifyNeed(text);
  const topScore = rules.scores[rules.intents[0]] ?? 0;
  if (!adapter || !adapter.ready() || topScore >= CONFIDENT_SCORE) return rules;
  const out = await withTimeout((s) => adapter.classify(text, s), timeoutMs);
  const clean = (out ?? []).filter((i) => VALID_INTENTS.includes(i)).slice(0, 3);
  if (!clean.length) return rules;
  // The model saying "other" never overrides a rule match.
  if (clean[0] === "other" && rules.intents[0] !== "other") return rules;
  const merged = [...clean, ...rules.intents.filter((i) => i !== "other" && !clean.includes(i))].slice(0, 3);
  return { intents: merged, scores: rules.scores, source: "model" };
}

/** Validates model output: same line count/prefixes as the template, no new crisis or PII-like content. */
export function acceptPolished(draft: string, polished: string | null): string {
  if (!polished) return draft;
  const a = draft.split("\n"), b = polished.trim().split("\n");
  if (a.length !== b.length) return draft;
  const prefixes = a.map((l) => l.split(":")[0]);
  if (!b.every((l, i) => l.startsWith(prefixes[i]))) return draft;
  // No new numbers, handles or links that were not already in the draft.
  const tokens = (x: string) => new Set(x.match(/\d{3,}|@[\w.\-]+|https?:\S+/g) ?? []);
  const known = tokens(draft);
  for (const t of tokens(polished)) if (!known.has(t)) return draft;
  if (detectCrisis(polished).level !== "none" && detectCrisis(draft).level === "none") return draft;
  if (polished.length > draft.length + 80) return draft;
  return polished;
}

export async function polishWithFallback(draft: string, adapter: LLMAdapter | null, timeoutMs = 20000): Promise<string> {
  if (!adapter || !adapter.ready()) return draft;
  const out = await withTimeout((s) => adapter.polishSummary(draft, s), timeoutMs);
  return acceptPolished(draft, out);
}

/** Default for milestone 1: no model. */
export const NO_MODEL: LLMAdapter | null = null;
