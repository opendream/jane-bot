import type { AgeBand } from "./types";
import { draftSummary, type SummaryInput } from "./summary";
import { isAdult, summaryAgeLabel, type AgeState } from "./age";

/** Map a live age state onto the pinned summary.ts AgeBand keys without editing that pin. */
export function pinnedAgeBand(age: AgeState): AgeBand {
  if (isAdult(age)) return "18-24";
  if (age === "15-17") return "15-17";
  return "unspecified";
}

/** Handoff summary with D5 age lines (ต่ำกว่า 18 ปี / 18 ปีขึ้นไป). */
export function draftSummaryForAge(input: Omit<SummaryInput, "ageBand"> & { ageBand: AgeState }): string {
  const raw = draftSummary({ ...input, ageBand: pinnedAgeBand(input.ageBand) });
  return raw.replace(/^- ช่วงอายุ: .*$/m, `- ช่วงอายุ: ${summaryAgeLabel(input.ageBand)}`);
}
