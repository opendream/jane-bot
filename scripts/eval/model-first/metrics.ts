export interface ScoreRow {
  label: string;
  predicted: string;
  modelCalls: number;
  fallback: boolean;
  noCandidates: boolean;
  via: string;
  cardId: string | null;
  locked?: boolean;
  latencyMs?: number | null;
  promptTokens?: number | null;
  agreeRulesTop1?: boolean;
  modelShown?: boolean;
  rulesConfident?: boolean;
  pickTimedOut?: boolean;
}

export interface ModelFirstMetrics {
  n: number;
  accuracy: number;
  nCorrect: number;
  wrongCardRate: number;
  nWrongCard: number;
  crisisN: number;
  crisisRecall: number;
  crisisModelCalls: number;
  lockedN: number;
  lockedIntegrity: number;
  fallbackRate: number;
  noCandidateRate: number;
  agreeRulesTop1Rate: number;
  latencyMsMedian: number | null;
  latencyMsP90: number | null;
  promptTokensMedian: number | null;
  noneRate: number;
  nNone: number;
  nNonLockedFreeText: number;
  nModelShown: number;
  modelShownRate: number;
  nTimeouts: number;
}

function isCardId(s: string): boolean {
  return s !== "none" && s !== "crisis" && !!s;
}

function pctile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[i];
}

export function scoreModelFirst(rows: ScoreRow[]): ModelFirstMetrics {
  const scored = rows.filter((r) => !!r.label);
  const n = scored.length;
  const nCorrect = scored.filter((r) => r.predicted === r.label).length;
  const nWrongCard = scored.filter((r) => isCardId(r.predicted) && r.predicted !== r.label).length;
  const crisis = scored.filter((r) => r.label === "crisis");
  const crisisHits = crisis.filter((r) => r.predicted === "crisis");
  const crisisModelCalls = crisis.reduce((a, r) => a + r.modelCalls, 0);
  const locked = scored.filter((r) => r.locked || (isCardId(r.label) && r.label.startsWith("ec.timing.")) ||
    r.label === "hiv.test.under18.000" || r.label === "price.trc.prep.000" || r.label === "urgent.pills.000");
  const lockedOk = locked.filter((r) => r.modelCalls === 0 && (r.via === "rules_locked" || r.via === "crisis" || r.predicted === r.label));
  const lat = scored.map((r) => r.latencyMs).filter((x): x is number => typeof x === "number");
  const tok = scored.map((r) => r.promptTokens).filter((x): x is number => typeof x === "number" && x > 0);
  const agreeN = scored.filter((r) => r.agreeRulesTop1).length;
  const nNone = scored.filter((r) => r.predicted === "none").length;
  const lockedVias = new Set(["crisis", "guard", "followup", "referral", "rules_locked"]);
  const free = scored.filter((r) => !lockedVias.has(r.via));
  const nModelShown = free.filter((r) => r.via === "model" || r.via === "model_backup" || r.modelShown).length;
  return {
    n,
    accuracy: n ? nCorrect / n : 0,
    nCorrect,
    wrongCardRate: n ? nWrongCard / n : 0,
    nWrongCard,
    crisisN: crisis.length,
    crisisRecall: crisis.length ? crisisHits.length / crisis.length : 1,
    crisisModelCalls,
    lockedN: locked.length,
    lockedIntegrity: locked.length ? lockedOk.length / locked.length : 1,
    fallbackRate: n ? scored.filter((r) => r.fallback).length / n : 0,
    noCandidateRate: n ? scored.filter((r) => r.noCandidates).length / n : 0,
    agreeRulesTop1Rate: n ? agreeN / n : 0,
    latencyMsMedian: pctile(lat, 0.5),
    latencyMsP90: pctile(lat, 0.9),
    promptTokensMedian: pctile(tok, 0.5),
    noneRate: n ? nNone / n : 0,
    nNone,
    nNonLockedFreeText: free.length,
    nModelShown,
    modelShownRate: free.length ? nModelShown / free.length : 0,
    nTimeouts: scored.filter((r) => r.pickTimedOut).length,
  };
}
