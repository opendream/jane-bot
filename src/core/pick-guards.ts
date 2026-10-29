/**
 * Model-first post-check: block medically / legally / service-risky card swaps.
 * Flag-off retrieval is untouched. Pairs are from the V3 (k=3) wrong-card audit.
 */

function idMatches(id: string, spec: string): boolean {
  return spec.endsWith(".") ? id.startsWith(spec) : id === spec;
}

/** [rules top-1, model pick] — either direction is blocked. */
const RISKY_PAIRS: readonly [string, string][] = [
  // j113: IPV card vs street-harassment card (wrong service advice)
  ["relationship.violence.", "harassment."],
  // p04: EC timing vs condom
  ["ec.timing.", "condom.000"],
  ["urgent.pills.", "condom.000"],
  // p06: EC hours vs PEP (wrong medical)
  ["ec.timing.", "protection.pep."],
  ["urgent.pills.", "protection.pep."],
  ["pregnancy.ec_ask.", "protection.pep."],
  // p05: condom incident vs abortion (wrong medical / legal)
  ["condom.leak.", "pregnancy.abortion."],
  // p12: under-18 HIV privacy vs pregnancy timing (wrong medical / legal)
  ["hiv.test.", "pregnancy.notthetime."],
  // j158 / p07: general contraception vs a method-specific or EC-ask card
  ["birth.control.000", "birth.control.implant."],
  ["birth.control.000", "pregnancy.ec_ask."],
];

/** High-stakes medical cards must not be shown from an empty rules retrieve (backup / no-candidates). */
const UNSAFE_WITHOUT_RULES = [
  "pregnancy.abortion.",
  "protection.pep.",
  "pregnancy.notthetime.",
] as const;

export function shouldForceRulesFallback(rulesTopId: string | null | undefined, modelId: string): boolean {
  if (!modelId) return false;
  if (!rulesTopId) return UNSAFE_WITHOUT_RULES.some((s) => idMatches(modelId, s));
  if (rulesTopId === modelId) return false;
  for (const [a, b] of RISKY_PAIRS) {
    if ((idMatches(rulesTopId, a) && idMatches(modelId, b)) || (idMatches(rulesTopId, b) && idMatches(modelId, a))) {
      return true;
    }
  }
  return false;
}
