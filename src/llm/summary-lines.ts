import { stripPII, clip } from "../core/summary";

export const NEED_PREFIX = "- เรื่องที่อยากปรึกษา: ";

export function needLine(draft: string): string | null {
  const l = draft.split("\n").find((x) => x.startsWith(NEED_PREFIX));
  return l ? l.slice(NEED_PREFIX.length) : null;
}

/** Replace only her-words line; the model's text gets the same PII pass and length cap. */
export function replaceNeedLine(draft: string, text: string): string {
  const safe = clip(stripPII(text));
  return draft.split("\n").map((x) => (x.startsWith(NEED_PREFIX) ? NEED_PREFIX + safe : x)).join("\n");
}
