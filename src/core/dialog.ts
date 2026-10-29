import type { CrisisCategory, CrisisResult, Intent } from "./types";
import { type BankCard, type BankTopic, type CardNext, shippable } from "./bank";
import { AGE_REDIRECT_CARD, AGE_REDIRECT_ID, afterPick, type AgeState } from "./age";
import { detectCrisis } from "./crisis";
import { normalize, findPhrases } from "./text";
import { stripPII } from "./summary";
import { checkInput, REFUSAL_CARDS, type GuardReason } from "./guard";
import { retrieve } from "./retrieve";
import { VALID_INTENTS } from "../llm/adapter";
import { acceptReword, type RewordContext } from "../llm/rewordGuard";
import type { IntentMatcher } from "./matcher";
import {
  decideCardPick,
  MODEL_PICK_TIMEOUT_MS,
  type CardPicker,
  type EngineReason,
  type EngineTag,
} from "./pick-engine";

export type { CardPicker, EngineReason, EngineTag } from "./pick-engine";

/* ------------------------------------------------------------------------------------------
 * Per-turn chat pipeline (build plan v2 §3). Pure apart from the optional model, which is
 * injected. State is memory-only and never logged.
 *   1. crisis rules (every message, synchronous, BEFORE anything else; never the model or matcher)
 *   2. input guard   3. follow-up chips
 *   4. optional matcher (injected only when the desktop-dev flag is on; abstain → fallback)
 *   5. rules retrieval   6. model pick (only if unsure; every free-text turn when modelPick is on, except locked routes)
 *   7. post-pick age gate (18+ card → redirect)   8. reword (validated, else verbatim)   9. reply with chips and referral offer
 * ---------------------------------------------------------------------------------------- */

export const WELCOME_ID = "general.welcome.000";
export const FALLBACK_ID = "general.fallback.000";
export const SOFT_CAP = 20;
export const HARD_CAP = 30;
export const PICK_TIMEOUT_MS = 8000;
/** Reword budget (plan §4); on timeout the exact card text is shown. */
export const REWORD_TIMEOUT_MS = 8000;
/** The model never sees more than this many characters of her message (PII-stripped first). */
export const MODEL_INPUT_CHARS = 200;

/** "Talk to a real person" requests (DRAFT). These skip retrieval and go straight to the referral offer. */
export const HUMAN_ASK = ["อยากคุยกับเจ้าหน้าที่", "คุยกับเจ้าหน้าที่", "ขอคุยกับเจ้าหน้าที่", "คุยกับคนจริง", "อยากคุยกับคนจริง", "ขอคุยกับคน", "talk to a person", "talk to someone real"];

export interface DialogState {
  ageBand: AgeState;
  cardId: string | null;
  topic: BankTopic | null;
  pendingChips: CardNext[];
  turns: number;
  /** Last 1–2 user lines, memory only. Used so a split crisis ("หนูอยาก" + "ตาย") still fires. */
  recentUser: string[];
  /** Once crisis has fired this session, later turns keep the help strip / offer visible. */
  crisisFired: boolean;
  crisisCategories: CrisisCategory[];
}

export const newDialog = (ageBand: AgeState = null): DialogState => ({
  ageBand, cardId: null, topic: null, pendingChips: [], turns: 0, recentUser: [], crisisFired: false, crisisCategories: [],
});

/** Drop a late classify / polish once a newer request exists, the user left describe, or the session was erased / quick-exited. */
export function shouldApplyAsyncResult(mine: number, current: number, screen: string): boolean {
  return mine === current && screen !== "crisis" && screen !== "start" && screen !== "neutral" && screen !== "chat";
}

/** Classify generation: busy is owned by one seq and dies when that seq is bumped or ended. */
export interface NeedGate { seq: number; busyFor: number }
export const newNeedGate = (): NeedGate => ({ seq: 0, busyFor: 0 });
export function bumpNeed(gate: NeedGate): number {
  gate.seq += 1;
  gate.busyFor = 0;
  return gate.seq;
}
export function beginNeed(gate: NeedGate): number {
  gate.seq += 1;
  gate.busyFor = gate.seq;
  return gate.seq;
}
export const needBusy = (gate: NeedGate): boolean => gate.busyFor !== 0 && gate.busyFor === gate.seq;
export function endNeed(gate: NeedGate, mine: number): void {
  if (gate.busyFor === mine) gate.busyFor = 0;
}

function uniqueCats(cats: CrisisCategory[]): CrisisCategory[] {
  return [...new Set(cats)];
}

function joinedWindow(input: string, prev: string[]): string {
  return prev.length ? [...prev.slice(-2), input].join(" ") : input;
}

/** Current line, then current + previous 1–2 user lines (in memory only). */
function crisisForTurn(input: string, prev: string[]): CrisisResult {
  const cur = detectCrisis(input);
  if (cur.crisis) return cur;
  if (prev.length) {
    const joined = detectCrisis(joinedWindow(input, prev));
    if (joined.crisis) return joined;
  }
  return cur;
}

export interface ShortlistItem { id: string; title_th: string; key_fact?: string }

/** Optional on-device model. Crisis turns never reach it. */
export interface DialogModel {
  ready(): boolean;
  /** Remaining ms of final warm-up; omit/null if not in that stage. Used when modelPick is on. */
  warmupRemainingMs?(): number | null;
  /** Choose one id from the shortlist, or null/"none". Input is PII-stripped and clipped. */
  pickCard?(text: string, shortlist: ShortlistItem[], previousTitle: string | null, signal: AbortSignal): Promise<string | null>;
  /** Reword a card. The model sees only the card (never her text). The result is validated; any failure shows answer_th verbatim. */
  reword?(card: BankCard, signal: AbortSignal): Promise<string | null>;
}

export interface TurnDeps {
  cards: BankCard[];
  model?: DialogModel | null;
  copyStatus: "draft" | "reviewed";
  signal?: AbortSignal;
  pickTimeoutMs?: number;
  /** Phones, link hosts and public handles the reword validator allows (from bankContext()). No context = no reword. */
  rewordCtx?: RewordContext | null;
  rewordTimeoutMs?: number;
  /** Override: turn a chosen card into display text (default: modelReword when possible, else verbatim). */
  render?: (card: BankCard, signal: AbortSignal) => Promise<{ text: string; reworded: boolean }>;
  /**
   * Optional embedding matcher. Omitted/null keeps the current rules path byte-for-byte.
   * Injected only by the desktop-dev flag (never on phones). Runs after crisis/guard/chips.
   */
  matcher?: IntentMatcher | null;
  /**
   * Model-first card pick (PR 2). Default off: same rules-first path as before.
   * Tests inject true plus a stub cardPicker; production reads MODEL_CARD_PICK.
   */
  modelPick?: boolean;
  /** Stub / raw picker. When set, used instead of wrapping model.pickCard. */
  cardPicker?: CardPicker | null;
  warmupRemainingMs?: () => number | null;
  /** Live model so a mid-wait load is seen. Defaults to deps.model. */
  getModel?: () => DialogModel | null;
}

export type Via = "followup" | "rules" | "model" | "rules_top1" | "fallback" | "guard" | "welcome" | "age_redirect" | "matcher";

export type TurnReply =
  | { kind: "crisis"; categories: CrisisCategory[]; engine?: EngineTag }
  | { kind: "readonly" }
  | { kind: "referral"; intents: Intent[]; banner: CrisisCategory[]; capNotice: CapNotice }
  | {
      kind: "card"; card: BankCard; text: string; reworded: boolean; via: Via; banner: CrisisCategory[];
      chips: CardNext[]; offer: "none" | "soft" | "strong"; offerIntents: Intent[]; capNotice: CapNotice; guard?: GuardReason;
      engine?: EngineTag; engineReason?: EngineReason;
    };
export type CapNotice = "soft" | "hard" | null;

async function withTimeout<T>(fn: (s: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T | null> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  outer?.addEventListener("abort", stop);
  const t = setTimeout(stop, ms);
  try {
    return await Promise.race([fn(ac.signal), new Promise<null>((r) => ac.signal.addEventListener("abort", () => r(null)))]);
  } catch { return null; } finally { clearTimeout(t); outer?.removeEventListener("abort", stop); }
}

const verbatim = async (c: BankCard) => ({ text: c.answer_th, reworded: false });

/** Default render: ask the model to reword, validate, and fall back to the exact text on any failure or timeout. */
export async function modelReword(card: BankCard, deps: Pick<TurnDeps, "model" | "rewordCtx" | "rewordTimeoutMs">, signal: AbortSignal): Promise<{ text: string; reworded: boolean }> {
  const m = deps.model;
  if (!card.reword || !deps.rewordCtx || !m?.ready() || !m.reword) return verbatim(card);
  const out = await withTimeout((s) => m.reword!(card, s), deps.rewordTimeoutMs ?? REWORD_TIMEOUT_MS, signal);
  if (signal.aborted) return verbatim(card);
  const r = acceptReword(card, out, deps.rewordCtx);
  return { text: r.text, reworded: r.reworded };
}

function asIntents(topic: BankTopic | null, fallback: Intent[]): Intent[] {
  return topic && (VALID_INTENTS as readonly string[]).includes(topic) ? [topic as Intent] : fallback;
}

/** First message of a chat: the welcome card (no input to check). */
export function welcome(state: DialogState, cards: BankCard[]): { state: DialogState; reply: TurnReply } {
  const card = cards.find((c) => c.id === WELCOME_ID);
  if (!card) throw new Error(`bank has no ${WELCOME_ID}`);
  return {
    state: { ...state, cardId: card.id, topic: null, pendingChips: card.next },
    reply: { kind: "card", card, text: card.answer_th, reworded: false, via: "welcome", banner: [], chips: card.next, offer: card.referral.offer, offerIntents: card.referral.intents, capNotice: null },
  };
}

function pickerFromModel(m: DialogModel | null, warmupRemainingMs?: () => number | null): CardPicker | null {
  if (!m?.pickCard) return null;
  return {
    ready: () => m.ready() && !!m.pickCard,
    warmupRemainingMs: () => m.warmupRemainingMs?.() ?? warmupRemainingMs?.() ?? null,
    pick: async (text, shortlist, prev, signal) => {
      const id = await m.pickCard!(text, shortlist, prev, signal);
      return id == null ? '{"id":"none"}' : JSON.stringify({ id });
    },
  };
}

export async function runTurn(state: DialogState, input: string, deps: TurnDeps): Promise<{ state: DialogState; reply: TurnReply }> {
  // 1. Crisis rules first, synchronously, on every message. Nothing before this line may await.
  const pickOn = !!deps.modelPick;
  const recentUser = [...state.recentUser, input].slice(-2);
  const crisis = crisisForTurn(input, state.recentUser);
  if (crisis.crisis) {
    return {
      // Drop the lines that already fired so a later turn cannot re-join them.
      state: { ...state, pendingChips: [], recentUser: [], crisisFired: true, crisisCategories: crisis.categories },
      reply: { kind: "crisis", categories: crisis.categories, ...(pickOn ? { engine: "rules-crisis" as const } : {}) },
    };
  }
  const banner = uniqueCats([
    ...(crisis.level === "banner" ? crisis.categories : []),
    ...(state.crisisFired ? state.crisisCategories : []),
  ]);

  if (state.turns >= HARD_CAP) return { state: { ...state, recentUser }, reply: { kind: "readonly" } };
  const turns = state.turns + 1;
  const capNotice: CapNotice = turns === HARD_CAP ? "hard" : turns === SOFT_CAP ? "soft" : null;
  const byId = new Map(deps.cards.map((c) => [c.id, c]));
  if (!byId.has(AGE_REDIRECT_ID)) byId.set(AGE_REDIRECT_ID, AGE_REDIRECT_CARD);
  // 18+ cards stay in the pool so a match can redirect after pick. Crisis and human-ask never reach this.
  const usable = (c: BankCard | undefined): c is BankCard => !!c && shippable(c, deps.copyStatus);
  const fallback = byId.get(FALLBACK_ID);
  if (!fallback) throw new Error(`bank has no ${FALLBACK_ID}`);
  const redirect = byId.get(AGE_REDIRECT_ID) ?? AGE_REDIRECT_CARD;
  const render = deps.render ?? ((c: BankCard, sig: AbortSignal) => modelReword(c, deps, sig));

  const reply = async (picked: BankCard, via: Via, guard?: GuardReason, engine?: EngineTag, engineReason?: EngineReason) => {
    const card = afterPick(picked, state.ageBand, redirect);
    const shownVia: Via = card.id === AGE_REDIRECT_ID && picked.id !== AGE_REDIRECT_ID ? "age_redirect" : via;
    const r = card.reword ? await render(card, deps.signal ?? new AbortController().signal) : { text: card.answer_th, reworded: false };
    const offer = state.crisisFired && card.referral.offer === "none" ? "soft" : card.referral.offer;
    const offerIntents = offer === "none" ? card.referral.intents : (card.referral.intents.length ? card.referral.intents : asIntents(state.topic, ["other"]));
    const next: DialogState = {
      ...state, turns, recentUser, cardId: card.id,
      topic: card.topic === "general" ? state.topic : card.topic, pendingChips: card.next,
    };
    return { state: next, reply: { kind: "card" as const, card, text: r.text, reworded: r.reworded, via: shownVia, banner, chips: card.next, offer, offerIntents, capNotice, ...(guard ? { guard } : {}), ...(engine ? { engine } : {}), ...(engineReason ? { engineReason } : {}) } };
  };

  // 2. Input guard (image / method refusals). Abuse and complication detection is deferred to #21.
  const g = checkInput(input);
  if (g) return reply(REFUSAL_CARDS[g], "guard", g, pickOn ? "rules-guard" : undefined);

  // "Talk to a real person" → referral offer for the current topic.
  if (findPhrases(input, HUMAN_ASK).length) {
    return { state: { ...state, turns, recentUser, pendingChips: [] }, reply: { kind: "referral", intents: asIntents(state.topic, retrieve(input, []).prior.intents), banner, capNotice } };
  }

  // 3. Follow-up chips: a tap sends the chip label; short replies that equal a label also match.
  const said = normalize(input).replace(/\s+/g, "");
  const chip = state.pendingChips.find((c) => normalize(c.label_th).replace(/\s+/g, "") === said);
  if (chip && usable(byId.get(chip.card_id))) return reply(byId.get(chip.card_id)!, "followup", undefined, pickOn ? "rules-chip" : undefined);

  // Optional matcher (desktop-dev flag only). Crisis already returned above, so a hit cannot override it.
  if (deps.matcher) {
    let decision: { kind: "card"; cardId: string } | { kind: "abstain" } = { kind: "abstain" };
    try { decision = await deps.matcher.match(input); } catch { /* abstain; never throw into chat */ }
    if (decision.kind === "card") {
      const picked = byId.get(decision.cardId);
      if (usable(picked)) return reply(picked, "matcher");
    }
    return reply(fallback, "fallback");
  }

  if (pickOn) {
    const livePicker = () => deps.cardPicker ?? pickerFromModel(deps.getModel?.() ?? deps.model ?? null, deps.warmupRemainingMs);
    const decision = await decideCardPick({
      text: input,
      modelText: stripPII(input).slice(0, MODEL_INPUT_CHARS),
      topic: state.topic,
      ageBand: state.ageBand,
      cards: deps.cards,
      copyStatus: deps.copyStatus,
      picker: livePicker(),
      getPicker: livePicker,
      warmupRemainingMs: deps.warmupRemainingMs,
      previousTitle: state.cardId ? byId.get(state.cardId)?.title_th ?? null : null,
      timeoutMs: deps.pickTimeoutMs ?? MODEL_PICK_TIMEOUT_MS,
      signal: deps.signal,
    });
    const picked = byId.get(decision.cardId);
    return reply(usable(picked) ? picked : fallback, decision.via, undefined, decision.engine, decision.reason);
  }

  // 4. Rules retrieval (18+ cards stay in the pool so a match can redirect).
  const pool = deps.cards.filter((c) => usable(c) && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
  const r = retrieve(input, pool, state.topic);
  if (r.confident) return reply(r.ranked[0].card, "rules");

  // 5. Model picks from the shortlist only when the rules are unsure.
  const m = deps.model;
  if (m?.ready() && m.pickCard && r.ranked.length) {
    const shortlist = r.ranked.map((s) => ({ id: s.card.id, title_th: s.card.title_th }));
    const clean = stripPII(input).slice(0, MODEL_INPUT_CHARS);
    const prev = state.cardId ? byId.get(state.cardId)?.title_th ?? null : null;
    const id = await withTimeout((s) => m.pickCard!(clean, shortlist, prev, s), deps.pickTimeoutMs ?? PICK_TIMEOUT_MS, deps.signal);
    const picked = id && shortlist.some((s) => s.id === id) ? byId.get(id) : undefined;
    if (usable(picked)) return reply(picked, "model");
  }
  // 6. Rules top-1 if anything scored, else the honest "don't know yet" card (เริ่มใหม่ only).
  if (r.ranked.length) return reply(r.ranked[0].card, "rules_top1");
  return reply(fallback, "fallback");
}

/**
 * One chat session: owns the state and the in-flight turn. A new message aborts the previous turn's
 * model call (so a crisis message mid-turn wins at once), and replies from aborted turns are dropped.
 */
export class DialogSession {
  state: DialogState;
  private inflight: AbortController | null = null;
  private seq = 0;
  constructor(ageBand: AgeState, private deps: Omit<TurnDeps, "signal">) { this.state = newDialog(ageBand); }
  start(): TurnReply { const w = welcome(this.state, this.deps.cards); this.state = w.state; return w.reply; }
  setModel(model: DialogModel | null) { this.deps = { ...this.deps, model }; }
  setMatcher(matcher: IntentMatcher | null) { this.deps = { ...this.deps, matcher }; }
  async send(text: string): Promise<TurnReply | null> {
    this.inflight?.abort();
    const ac = new AbortController();
    this.inflight = ac;
    const my = ++this.seq;
    const out = await runTurn(this.state, text, { ...this.deps, signal: ac.signal, getModel: () => this.deps.model ?? null });
    if (my !== this.seq) return null; // superseded by a newer message
    this.state = out.state;
    this.inflight = null;
    return out.reply;
  }
  abort() { this.inflight?.abort(); this.seq++; }
}
