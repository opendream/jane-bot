import type { Hours } from "./types";
import { SERVICE_TZ } from "../config";

export interface OpenStatus {
  state: "open" | "closed" | "unknown";
  /** Thai label, e.g. "เปิดอยู่ตอนนี้ (ถึง 21:00)" */
  label_th: string;
  /** Minutes since local midnight in SERVICE_TZ, for tests. */
  minutesNow: number;
}

/** Minutes since midnight in the given IANA zone (Thailand has no DST, but we don't assume that). */
export function minutesInZone(now: Date, tz = SERVICE_TZ): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return h * 60 + m;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Open is inclusive, close is exclusive. Supports windows that cross midnight (e.g. 20:00–02:00). */
export function isOpenAt(hours: Hours, minutes: number): boolean | null {
  if (hours.type === "24h") return true;
  if (hours.type === "varies") return null;
  const o = toMin(hours.open);
  const c = toMin(hours.close);
  if (o === c) return true;
  return o < c ? minutes >= o && minutes < c : minutes >= o || minutes < c;
}

export function openStatus(hours: Hours, now: Date = new Date(), tz = SERVICE_TZ): OpenStatus {
  const minutesNow = minutesInZone(now, tz);
  const open = isOpenAt(hours, minutesNow);
  if (open === null) return { state: "unknown", label_th: "เวลาเปิดแตกต่างกันแต่ละแห่ง", minutesNow };
  if (hours.type === "24h") return { state: "open", label_th: "เปิด 24 ชั่วโมง", minutesNow };
  const h = hours as { open: string; close: string };
  return open
    ? { state: "open", label_th: `เปิดอยู่ตอนนี้ (ถึง ${h.close} น.)`, minutesNow }
    : { state: "closed", label_th: `ปิดอยู่ เปิดเวลา ${h.open} น.`, minutesNow };
}

export function hoursLabel(hours: Hours): string {
  if (hours.type === "24h") return "ตลอด 24 ชั่วโมง";
  if (hours.type === "varies") return "แตกต่างกันแต่ละแห่ง";
  return `ทุกวัน ${hours.open}–${hours.close} น.`;
}
