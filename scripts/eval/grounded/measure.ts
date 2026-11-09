/**
 * Measure structured-choice + chatGuard fallback rate on a fixture file.
 * No live model. Default fixtures are synthetic (tests/fixtures/chat-ground-measure.ts).
 *
 *   npx vite-node scripts/eval/grounded/measure.ts
 *
 * Prints counts and case ids only — never user text, never secrets.
 */

import { BANK } from "../../../src/core/bankData";
import { measureGroundedReplies } from "../../../src/llm/chat-ground-measure";
import { GROUND_MEASURE_CASES } from "../../../tests/fixtures/chat-ground-measure";

const r = measureGroundedReplies(GROUND_MEASURE_CASES, BANK);
const failed = r.rows.filter((row) => !row.accepted).map((row) => row.id);
process.stdout.write(`${JSON.stringify({
  total: r.total,
  accepted: r.accepted,
  fallback: r.fallback,
  fallbackRate: r.fallbackRate,
  byArm: r.byArm,
  fallbackIds: failed,
}, null, 2)}\n`);
