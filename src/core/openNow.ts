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
  if (hours.type === "varies" || hours.type === "unpublished") return null;
  const o = toMin(hours.open);
  const c = toMin(hours.close);
  if (o === c) return true;
  return o < c ? minutes >= o && minutes < c : minutes >= o || minutes < c;
}

export function openStatus(hours: Hours, now: Date = new Date(), tz = SERVICE_TZ): OpenStatus {
  const minutesNow = minutesInZone(now, tz);
  if (hours.type === "unpublished") return { state: "unknown", label_th: "ไม่ระบุเวลาเปิด", minutesNow };
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
  if (hours.type === "unpublished") return "ไม่ระบุเวลาเปิด สอบถามที่โรงพยาบาล";
  return `ทุกวัน ${hours.open}–${hours.close} น.`;
}

const minutesOpen = (h: { open: string; close: string }) => {
  const o = toMin(h.open), c = toMin(h.close);
  return o === c ? 1440 : (c - o + 1440) % 1440;
};

/**
 * Where sources disagree, use the NARROWER window (Keng, 22 Oct 2026): never claim "open" when any source says closed.
 * - "24h" is the widest; it only wins if every source says 24h.
 * - "varies" sources carry no window; if all sources vary, the result varies.
 * - Same-day windows are intersected (latest open, earliest close). If a window crosses midnight or the
 *   intersection is empty, the shortest single window is used instead (still conservative, never wider).
 */
export function narrowestHours(list: Hours[]): Hours {
  const daily = list.filter((h): h is { type: "daily"; open: string; close: string } => h.type === "daily");
  if (!daily.length) {
    if (list.some((h) => h.type === "24h")) return { type: "24h" };
    if (list.length && list.every((h) => h.type === "unpublished")) return { type: "unpublished" };
    return { type: "varies" };
  }
  if (daily.length === 1) return daily[0];
  const sameDay = daily.every((h) => toMin(h.open) < toMin(h.close));
  if (sameDay) {
    const o = Math.max(...daily.map((h) => toMin(h.open))), c = Math.min(...daily.map((h) => toMin(h.close)));
    if (o < c) {
      const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return { type: "daily", open: hh(o), close: hh(c) };
    }
  }
  return [...daily].sort((a, b) => minutesOpen(a) - minutesOpen(b))[0];
}

const sameHours = (a: Hours, b: Hours) => hoursLabel(a) === hoursLabel(b);

export interface HoursCitation {
  /** e.g. "ทุกวัน 10:00–20:00 น." */
  effective_th: string;
  /** Sources disagree, so the narrower window is in use. */
  conflict: boolean;
  /** Shown under the card when there is a conflict. */
  conflict_note_th: string | null;
  /** One line per source: "RSATHAI: ทุกวัน 09:00–21:00 น. (source 2022) · rsathai.org/qrcode · ตรวจ 2026-10-22" */
  lines: string[];
}

export function hoursCitation(s: { hours_sources: { hours: Hours; by: string; url: string; as_of?: string; checked: string }[] }): HoursCitation {
  const eff = narrowestHours(s.hours_sources.map((x) => x.hours));
  const conflict = s.hours_sources.some((x) => !sameHours(x.hours, s.hours_sources[0].hours));
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  return {
    effective_th: hoursLabel(eff),
    conflict,
    conflict_note_th: conflict ? "แหล่งข้อมูลระบุเวลาไม่ตรงกัน จึงใช้ช่วงเวลาที่แคบกว่าในการบอกว่าเปิดอยู่หรือไม่" : null,
    lines: s.hours_sources.map((x) =>
      `${x.by}: ${hoursLabel(x.hours)}${x.as_of ? ` (source ${x.as_of})` : ""} · ${host(x.url)} · ตรวจ ${x.checked}`),
  };
}
