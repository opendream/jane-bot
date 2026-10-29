import type { BankCard, CardNext } from "../../../src/core/bank";
import { shippable } from "../../../src/core/bank";
import { AGE_REDIRECT_ID, afterPick, ageAllowed, type AgeState } from "../../../src/core/age";
import { detectCrisis } from "../../../src/core/crisis";
import { FALLBACK_ID, HUMAN_ASK, MODEL_INPUT_CHARS, WELCOME_ID } from "../../../src/core/dialog";
import { checkInput } from "../../../src/core/guard";
import { retrieve } from "../../../src/core/retrieve";
import { stripPII } from "../../../src/core/summary";
import { findPhrases, normalize } from "../../../src/core/text";
import { backupShortlist } from "./backup-shortlist";
import { isLockedCardId } from "./locked";
import type { EvalPicker } from "./pickers";

export type { EvalPicker } from "./pickers";

/** Model-first pick budget (plan: 20 s). Distinct from the 8 s runtime PICK_TIMEOUT_MS. */
export const MODEL_FIRST_PICK_TIMEOUT_MS = 20_000;

export type EvalKind = "crisis" | "guard" | "card" | "referral" | "fallback";
export type EvalVia =
  | "crisis"
  | "guard"
  | "followup"
  | "referral"
  | "rules_locked"
  | "rules"
  | "rules_top1"
  | "model"
  | "model_backup"
  | "rules_fallback"
  | "fallback";

export interface EvalTurnOut {
  kind: EvalKind;
  label: string;
  cardId: string | null;
  via: EvalVia;
  modelCalls: number;
  fallback: boolean;
  noCandidates: boolean;
  backupUsed: boolean;
  backupIds: string[];
  backupHit: boolean;
  rulesCandidateCount: number;
  rulesTop1: string | null;
  rulesIds: string[];
  agreeRulesTop1: boolean;
  latencyMs: number | null;
  promptTokens: number | null;
  ageRedirect: boolean;
  locked: boolean;
  shortlistIds: string[];
  pickRaw: string | null;
}

export interface EvalTurnOpts {
  cards: BankCard[];
  picker?: EvalPicker | null;
  k?: number;
  timeoutMs?: number;
  age?: AgeState;
  pendingChips?: CardNext[];
  backup?: boolean;
  copyStatus?: "draft" | "reviewed";
  previousTitle?: string | null;
  mode?: "model-first" | "rules";
}

function predictedLabel(out: EvalTurnOut): string {
  if (out.kind === "crisis") return "crisis";
  if (out.cardId && out.cardId !== FALLBACK_ID && out.cardId !== AGE_REDIRECT_ID) return out.cardId;
  return "none";
}

function base(partial: Partial<EvalTurnOut> & Pick<EvalTurnOut, "kind" | "via">): EvalTurnOut {
  const out: EvalTurnOut = {
    kind: partial.kind,
    cardId: partial.cardId ?? null,
    via: partial.via,
    modelCalls: partial.modelCalls ?? 0,
    fallback: partial.fallback ?? false,
    noCandidates: partial.noCandidates ?? false,
    backupUsed: partial.backupUsed ?? false,
    backupIds: partial.backupIds ?? [],
    backupHit: partial.backupHit ?? false,
    rulesCandidateCount: partial.rulesCandidateCount ?? 0,
    rulesTop1: partial.rulesTop1 ?? null,
    rulesIds: partial.rulesIds ?? [],
    agreeRulesTop1: false,
    latencyMs: partial.latencyMs ?? null,
    promptTokens: partial.promptTokens ?? null,
    ageRedirect: partial.ageRedirect ?? false,
    locked: partial.locked ?? false,
    shortlistIds: partial.shortlistIds ?? [],
    pickRaw: partial.pickRaw ?? null,
    label: "",
  };
  out.label = predictedLabel(out);
  out.agreeRulesTop1 = !!out.cardId && out.cardId === out.rulesTop1;
  return out;
}

function pickPool(cards: BankCard[], copyStatus: "draft" | "reviewed"): BankCard[] {
  return cards.filter((c) => shippable(c, copyStatus) && c.id !== FALLBACK_ID && c.id !== WELCOME_ID);
}

async function withTimeout<T>(fn: (s: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T | null> {
  const ac = new AbortController();
  const stop = () => ac.abort();
  outer?.addEventListener("abort", stop);
  const t = setTimeout(stop, ms);
  try {
    return await Promise.race([
      fn(ac.signal),
      new Promise<null>((r) => ac.signal.addEventListener("abort", () => r(null))),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
    outer?.removeEventListener("abort", stop);
  }
}

function applyAge(card: BankCard, age: AgeState, cards: BankCard[]): { card: BankCard; redirect: boolean } {
  const redirect = cards.find((c) => c.id === AGE_REDIRECT_ID);
  const shown = afterPick(card, age, redirect as BankCard);
  return { card: shown, redirect: shown.id === AGE_REDIRECT_ID && card.id !== AGE_REDIRECT_ID };
}

export async function evalTurn(text: string, opts: EvalTurnOpts): Promise<EvalTurnOut> {
  const cards = opts.cards;
  const k = opts.k ?? 5;
  const timeoutMs = opts.timeoutMs ?? MODEL_FIRST_PICK_TIMEOUT_MS;
  const age: AgeState = opts.age ?? "18-24";
  const copyStatus = opts.copyStatus ?? "reviewed";
  const mode = opts.mode ?? "model-first";
  const byId = new Map(cards.map((c) => [c.id, c]));
  const fallback = byId.get(FALLBACK_ID);
  if (!fallback) throw new Error(`bank has no ${FALLBACK_ID}`);

  const crisis = detectCrisis(text);
  if (crisis.crisis) return base({ kind: "crisis", via: "crisis" });

  const guard = checkInput(text);
  if (guard) return base({ kind: "guard", via: "guard", cardId: `general.refusal_${guard}.000` });

  const chips = opts.pendingChips ?? [];
  const said = normalize(text).replace(/\s+/g, "");
  const chip = chips.find((c) => normalize(c.label_th).replace(/\s+/g, "") === said);
  if (chip && byId.get(chip.card_id) && shippable(byId.get(chip.card_id)!, copyStatus)) {
    const aged = applyAge(byId.get(chip.card_id)!, age, cards);
    return base({ kind: "card", via: "followup", cardId: aged.card.id, ageRedirect: aged.redirect });
  }

  if (findPhrases(text, HUMAN_ASK).length) {
    return base({ kind: "referral", via: "referral" });
  }

  const pool = pickPool(cards, copyStatus).filter((c) => ageAllowed(c, age) || c.age_min === 18);
  const r = retrieve(text, pool);
  const rulesIds = r.ranked.map((s) => s.card.id);
  const rulesTop1 = rulesIds[0] ?? null;
  const rulesMeta = { rulesCandidateCount: r.ranked.length, rulesTop1, rulesIds };

  if (rulesTop1 && isLockedCardId(rulesTop1)) {
    const aged = applyAge(r.ranked[0].card, age, cards);
    return base({
      kind: "card",
      via: "rules_locked",
      cardId: aged.card.id,
      locked: true,
      ageRedirect: aged.redirect,
      ...rulesMeta,
    });
  }

  if (mode === "rules") {
    if (r.confident && r.ranked[0]) {
      const aged = applyAge(r.ranked[0].card, age, cards);
      return base({ kind: "card", via: "rules", cardId: aged.card.id, ageRedirect: aged.redirect, ...rulesMeta });
    }
    if (r.ranked[0]) {
      const aged = applyAge(r.ranked[0].card, age, cards);
      return base({ kind: "card", via: "rules_top1", cardId: aged.card.id, ageRedirect: aged.redirect, ...rulesMeta });
    }
    return base({ kind: "fallback", via: "fallback", cardId: FALLBACK_ID, noCandidates: true, ...rulesMeta });
  }

  const picker = opts.picker;
  const shortlistCards = r.ranked.filter((s) => !isLockedCardId(s.card.id)).slice(0, k).map((s) => s.card);

  const finishModel = async (list: BankCard[], viaOk: EvalVia, backupUsed: boolean, backupIds: string[]) => {
    const shortlist = list.map((c) => ({ id: c.id, title_th: c.title_th }));
    const clean = stripPII(text).slice(0, MODEL_INPUT_CHARS);
    const picked = picker
      ? await withTimeout((s) => picker.pick(clean, shortlist, opts.previousTitle ?? null, s), timeoutMs)
      : null;
    const modelCalls = picker ? 1 : 0;
    const id = picked?.id && shortlist.some((s) => s.id === picked.id) ? picked.id : null;
    const chosen = id ? byId.get(id) : undefined;
    if (chosen && shippable(chosen, copyStatus)) {
      const aged = applyAge(chosen, age, cards);
      if (aged.redirect) {
        return base({
          kind: "card",
          via: "rules_fallback",
          cardId: aged.card.id,
          modelCalls,
          fallback: true,
          ageRedirect: true,
          latencyMs: picked?.latencyMs ?? null,
          promptTokens: picked?.promptTokens ?? null,
          shortlistIds: shortlist.map((s) => s.id),
          pickRaw: picked?.raw ?? null,
          backupUsed,
          backupIds,
          ...rulesMeta,
        });
      }
      return base({
        kind: "card",
        via: viaOk,
        cardId: aged.card.id,
        modelCalls,
        latencyMs: picked?.latencyMs ?? null,
        promptTokens: picked?.promptTokens ?? null,
        shortlistIds: shortlist.map((s) => s.id),
        pickRaw: picked?.raw ?? null,
        backupUsed,
        backupIds,
        backupHit: backupUsed && backupIds.includes(aged.card.id),
        ...rulesMeta,
      });
    }
    if (r.ranked[0]) {
      const aged = applyAge(r.ranked[0].card, age, cards);
      return base({
        kind: "card",
        via: "rules_fallback",
        cardId: aged.card.id,
        modelCalls,
        fallback: true,
        ageRedirect: aged.redirect,
        latencyMs: picked?.latencyMs ?? null,
        promptTokens: picked?.promptTokens ?? null,
        shortlistIds: shortlist.map((s) => s.id),
        pickRaw: picked?.raw ?? null,
        backupUsed,
        backupIds,
        ...rulesMeta,
      });
    }
    return base({
      kind: "fallback",
      via: "fallback",
      cardId: FALLBACK_ID,
      modelCalls,
      fallback: true,
      noCandidates: !backupUsed,
      latencyMs: picked?.latencyMs ?? null,
      promptTokens: picked?.promptTokens ?? null,
      shortlistIds: shortlist.map((s) => s.id),
      pickRaw: picked?.raw ?? null,
      backupUsed,
      backupIds,
      ...rulesMeta,
    });
  };

  if (shortlistCards.length && picker) {
    return finishModel(shortlistCards, "model", false, []);
  }
  if (shortlistCards.length && !picker) {
    const aged = applyAge(shortlistCards[0], age, cards);
    return base({
      kind: "card",
      via: r.confident ? "rules" : "rules_top1",
      cardId: aged.card.id,
      ageRedirect: aged.redirect,
      ...rulesMeta,
      shortlistIds: shortlistCards.map((c) => c.id),
    });
  }

  if (opts.backup !== false && picker) {
    const backup = backupShortlist(text, cards, { k: 3, age });
    const backupIds = backup.map((c) => c.id);
    if (backup.length) return finishModel(backup, "model_backup", true, backupIds);
    return base({
      kind: "fallback",
      via: "fallback",
      cardId: FALLBACK_ID,
      noCandidates: true,
      backupUsed: true,
      backupIds,
      ...rulesMeta,
    });
  }

  return base({
    kind: "fallback",
    via: "fallback",
    cardId: FALLBACK_ID,
    noCandidates: true,
    ...rulesMeta,
  });
}
