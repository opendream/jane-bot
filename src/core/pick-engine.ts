import type { AgeState } from "./age";
import { ageAllowed } from "./age";
import type { BankCard, BankTopic } from "./bank";
import { shippable } from "./bank";
import { shouldForceRulesFallback } from "./pick-guards";
import { retrieve } from "./retrieve";

/**
 * Model-first card-pick engine (Keng, 29 Oct 2026 BKK). PR 2: logic only, behind
 * MODEL_CARD_PICK (off). The model selects a reviewed card id; it never writes the
 * shown answer. Crisis / guard / chip stay rules-only in runTurn.
 *
 * D3 locked routes: rules top-1 is answered directly, zero model calls.
 * D4: when the flag is on, every other free-text turn asks the model, including
 * rules-confident ones. D12: 20 s pick budget. D7: no on-device rephrase here.
 */

export const LOCKED_ROUTE_IDS = [
  "hiv.test.under18.000",
  "price.trc.prep.000",
  "ec.timing.b001",
  "urgent.pills.000",
] as const;

export const HIV_PRIVACY_ID = "hiv.test.under18.000";
export const MODEL_PICK_TOP_N = 3;
export const MODEL_PICK_TIMEOUT_MS = 20_000;
/** Wait only when the loader is in final warm-up and reports ≤ this remaining. */
export const WARMUP_WAIT_MAX_MS = 5_000;

const FALLBACK_ID = "general.fallback.000";
const WELCOME_ID = "general.welcome.000";
const NONE_ID = "none";

export type EngineTag =
  | "model"
  | "rules-fallback"
  | "rules-locked"
  | "rules-crisis"
  | "chat-crisis"
  | "rules-guard"
  | "rules-chip"
  | "rules-not-ready";

export type EngineReason =
  | "none"
  | "malformed"
  | "timeout"
  | "runtime-error"
  | "out-of-shortlist"
  | "age-gated"
  | "unknown-id"
  | "no-candidates"
  | "not-ready"
  | "confident-agree"
  | "post-check";

export interface CardPicker {
  ready(): boolean;
  /** Remaining ms of the final warm-up stage; omit/null if not in that stage. */
  warmupRemainingMs?(): number | null;
  /** Raw model text (JSON). Allowed ids = shortlist plus 'none'. */
  pick(
    text: string,
    shortlist: { id: string; title_th: string; key_fact?: string }[],
    previousTitle: string | null,
    signal: AbortSignal,
  ): Promise<string>;
}

export interface PickDecision {
  cardId: string;
  via: "model" | "rules" | "rules_top1" | "fallback";
  engine: EngineTag;
  reason?: EngineReason;
  /** Chat-first turn 2: model said none, keep chatting. Default path still falls back. */
  deferred?: boolean;
}

export function isLockedRouteId(id: string): boolean {
  return (LOCKED_ROUTE_IDS as readonly string[]).includes(id);
}

type PickParse =
  | { kind: "id"; id: string }
  | { kind: "none" }
  | { kind: "malformed" }
  | { kind: "out-of-shortlist"; id: string };

/** Id-answer JSON only (the numeric-index prompt emitted 'none' 25/30 on the box). */
export function parsePickResult(raw: string, ids: readonly string[]): PickParse {
  const s = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const m = s.match(/"id"\s*:\s*"([^"]+)"/);
  if (!m) return { kind: "malformed" };
  const id = m[1];
  if (id === NONE_ID) return { kind: "none" };
  if (!ids.includes(id)) return { kind: "out-of-shortlist", id };
  return { kind: "id", id };
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) { resolve(); return; }
    const t = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(t); resolve(); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function withTimeout<T>(
  fn: (s: AbortSignal) => Promise<T>,
  ms: number,
  outer?: AbortSignal,
): Promise<{ value: T } | { timeout: true } | { error: true }> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  outer?.addEventListener("abort", stop);
  let timedOut = false;
  const t = setTimeout(() => { timedOut = true; stop(); }, ms);
  try {
    return await Promise.race([
      fn(ac.signal).then((value) => ({ value })),
      new Promise<{ timeout: true }>((resolve) => {
        ac.signal.addEventListener("abort", () => resolve({ timeout: true }));
      }),
    ]);
  } catch {
    return timedOut || ac.signal.aborted ? { timeout: true } : { error: true };
  } finally {
    clearTimeout(t);
    outer?.removeEventListener("abort", stop);
  }
}

async function waitUntilReady(
  picker: CardPicker | null,
  getPicker: (() => CardPicker | null) | undefined,
  budgetMs: number,
  signal: AbortSignal | undefined,
  now: () => number,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  extraEta?: () => number | null,
): Promise<CardPicker | null> {
  const current = () => getPicker?.() ?? picker;
  const etaOf = (p: CardPicker | null) => p?.warmupRemainingMs?.() ?? extraEta?.() ?? null;
  const first = current();
  if (first?.ready()) return first;
  const eta = etaOf(first);
  if (eta == null || eta > WARMUP_WAIT_MAX_MS) return null;
  const deadline = now() + Math.min(budgetMs, Math.max(0, eta) + 25);
  while (now() < deadline) {
    if (signal?.aborted) return null;
    const p = current();
    if (p?.ready()) return p;
    await sleep(Math.min(25, Math.max(0, deadline - now())), signal);
  }
  const last = current();
  return last?.ready() ? last : null;
}

export interface DecidePickArgs {
  text: string;
  modelText: string;
  topic: BankTopic | null;
  ageBand: AgeState;
  cards: BankCard[];
  copyStatus: "draft" | "reviewed";
  picker: CardPicker | null;
  previousTitle: string | null;
  timeoutMs: number;
  signal?: AbortSignal;
  getPicker?: () => CardPicker | null;
  /** Loader ETA when the picker object does not yet exist (warm-up in flight). */
  warmupRemainingMs?: () => number | null;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /**
   * Chat-first end pick: `defer` keeps chatting when the model says none.
   * Default `fallback` is today's labelled rules fallback (unchanged).
   */
  nonePolicy?: "fallback" | "defer";
}

function rulesDecision(
  ranked: { card: BankCard }[],
  confident: boolean,
  engine: EngineTag,
  reason?: EngineReason,
): PickDecision {
  if (!ranked.length) {
    return { cardId: FALLBACK_ID, via: "fallback", engine, reason: reason ?? "no-candidates" };
  }
  const via = engine === "rules-locked" || confident ? "rules" : "rules_top1";
  return { cardId: ranked[0].card.id, via, engine, ...(reason ? { reason } : {}) };
}

/**
 * Free-text card decision after crisis / guard / chips. Does not generate answer text.
 */
export async function decideCardPick(args: DecidePickArgs): Promise<PickDecision> {
  const now = args.now ?? Date.now;
  const sleep = args.sleep ?? sleepMs;
  const byId = new Map(args.cards.map((c) => [c.id, c]));
  const usable = (c: BankCard | undefined): c is BankCard => !!c && shippable(c, args.copyStatus);
  const pool = args.cards.filter((c) => usable(c) && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
  const r = retrieve(args.text, pool, args.topic);
  const fallback = (engine: EngineTag, reason?: EngineReason): PickDecision =>
    rulesDecision(r.ranked, r.confident, engine, reason);

  if (!r.ranked.length) return fallback("rules-fallback", "no-candidates");

  const topId = r.ranked[0].card.id;
  if (isLockedRouteId(topId)) return fallback("rules-locked");

  const t0 = now();
  const ready = await waitUntilReady(
    args.picker, args.getPicker, args.timeoutMs, args.signal, now, sleep, args.warmupRemainingMs,
  );
  if (!ready) return fallback("rules-not-ready", "not-ready");

  const used = now() - t0;
  const budget = Math.max(0, args.timeoutMs - used);
  const shortlist = r.ranked.slice(0, MODEL_PICK_TOP_N).map((s) => ({
    id: s.card.id,
    title_th: s.card.title_th,
    key_fact: s.card.key_facts?.[0],
  }));
  const ids = shortlist.map((s) => s.id);

  const attempt = await withTimeout((s) => ready.pick(args.modelText, shortlist, args.previousTitle, s), budget, args.signal);
  if ("timeout" in attempt) return fallback("rules-fallback", "timeout");
  if ("error" in attempt) return fallback("rules-fallback", "runtime-error");

  const parsed = parsePickResult(attempt.value, ids);
  if (parsed.kind === "none") {
    if (args.nonePolicy === "defer") {
      return { cardId: FALLBACK_ID, via: "fallback", engine: "model", reason: "none", deferred: true };
    }
    return fallback("rules-fallback", "none");
  }
  if (parsed.kind === "malformed") return fallback("rules-fallback", "malformed");
  if (parsed.kind === "out-of-shortlist") return fallback("rules-fallback", "out-of-shortlist");

  const picked = byId.get(parsed.id);
  if (!usable(picked)) return fallback("rules-fallback", "unknown-id");
  if (!ageAllowed(picked, args.ageBand)) return fallback("rules-fallback", "age-gated");
  // Belt-and-suspenders: an under-18 HIV-privacy rules top-1 must never move.
  if (topId === HIV_PRIVACY_ID && parsed.id !== HIV_PRIVACY_ID) return fallback("rules-locked");
  // V1/V3: on a rules-confident turn, a different model pick is the labelled rules fallback.
  if (r.confident && parsed.id !== topId) return fallback("rules-fallback", "confident-agree");
  if (shouldForceRulesFallback(topId, parsed.id)) return fallback("rules-fallback", "post-check");
  // Locked ids may only override a non-locked route when shortlisted (already) and age-ok (above).
  return { cardId: picked.id, via: "model", engine: "model" };
}
