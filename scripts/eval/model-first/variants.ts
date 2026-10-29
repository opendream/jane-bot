/**
 * Measurement-only pick-policy variants. Never imported from src/.
 * Prompt text stays in this file so src/llm/prompts.ts remains a byte-identical pin.
 */
import type { BankCard } from "../../../src/core/bank";

export type VariantId = "v0" | "v1" | "v2" | "v3" | "v4";
export type PromptFamily = "titles" | "describe" | "describe+fewshot";
export type LockPolicy = "always" | "confident-only";

export interface ShortlistItem {
  id: string;
  title_th: string;
  key_fact?: string;
}

export interface VariantPolicy {
  id: VariantId;
  name: string;
  /** V1/V3/V4: if rules are confident and the model disagrees or says none, show the rules card. */
  confidentAgree: boolean;
  describe: boolean;
  fewShot: boolean;
  promptFamily: PromptFamily;
}

export const VARIANTS: Record<VariantId, VariantPolicy> = {
  v0: {
    id: "v0",
    name: "model-first (baseline)",
    confidentAgree: false,
    describe: false,
    fewShot: false,
    promptFamily: "titles",
  },
  v1: {
    id: "v1",
    name: "confident-agree",
    confidentAgree: true,
    describe: false,
    fewShot: false,
    promptFamily: "titles",
  },
  v2: {
    id: "v2",
    name: "card descriptions",
    confidentAgree: false,
    describe: true,
    fewShot: false,
    promptFamily: "describe",
  },
  v3: {
    id: "v3",
    name: "confident-agree + descriptions",
    confidentAgree: true,
    describe: true,
    fewShot: false,
    promptFamily: "describe",
  },
  v4: {
    id: "v4",
    name: "V3 + few-shot",
    confidentAgree: true,
    describe: true,
    fewShot: true,
    promptFamily: "describe+fewshot",
  },
};

/** Two synthetic Thai examples. Card titles + first key_facts are from the reviewed bank (not invented). */
export const PICK_FEWSHOT =
  "ตัวอย่าง:\n" +
  "ข้อความ: ถุงยางใส่ยังไง\n" +
  "รายการ:\n" +
  "condom.how_to.000 = วิธีใช้ถุงยาง — รูดถุงให้สุดถึงโคน\n" +
  "condom.000 = ถุงยางใช้ได้จริงไหม — ป้องกันการท้องได้ 98%\n" +
  'ตอบ: {"id":"condom.how_to.000"}\n' +
  "ข้อความ: เอชไอวีคืออะไร\n" +
  "รายการ:\n" +
  "disease.hiv.000 = เอชไอวีคืออะไร — เชื้อไวรัส\n" +
  "disease.hiv.001 = เอชไอวีรักษาหายไหม — ยังไม่มีวิธีการใดรักษา\n" +
  'ตอบ: {"id":"disease.hiv.000"}\n';

export function cardLine(s: ShortlistItem, describe: boolean): string {
  if (describe && s.key_fact) return `${s.id} = ${s.title_th} — ${s.key_fact}`;
  return `${s.id} = ${s.title_th}`;
}

/** Eval-only pick user prompt. Mirrors src/llm/prompts.pickUser plus optional description / few-shot. */
export function evalPickUser(
  text: string,
  shortlist: ShortlistItem[],
  previousTitle: string | null,
  opts: { describe?: boolean; fewShot?: boolean } = {},
): string {
  const list = shortlist.map((s) => cardLine(s, !!opts.describe)).join("\n");
  const head = opts.fewShot ? PICK_FEWSHOT : "";
  const prev = previousTitle ? `หัวข้อก่อนหน้า: ${previousTitle}\n` : "";
  return `${head}${prev}รายการ:\n${list}\nข้อความ: ${text}`;
}

export function toShortlistItem(card: BankCard): ShortlistItem {
  return { id: card.id, title_th: card.title_th, key_fact: card.key_facts?.[0] };
}

export const HIV_UNDER18_ID = "hiv.test.under18.000";

export const LOCKED_IDS = [
  "hiv.test.under18.000",
  "price.trc.prep.000",
  "ec.timing.b001",
  "urgent.pills.000",
] as const;
