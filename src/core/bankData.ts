import data from "../data/services.json";
import { THAI_COPY_STATUS } from "../config";
import { cardsFromFiles, hostOf, type BankCard, type BankContext } from "./bank";

/** Hosts allowed in card links besides the services.json sources (plan §1). Keep short; re-check each one. */
export const BANK_LINK_ALLOWLIST: readonly string[] = ["rsathai.org", "rh.anamai.moph.go.th", "dmh.go.th"];

type ServicesJson = typeof data;

/** Validation context from services.json: phones, cited hours per contact, link hosts, public handles. */
export function bankContext(services: ServicesJson = data, copyStatus: "draft" | "reviewed" = THAI_COPY_STATUS, today?: string): BankContext {
  const phones = new Set<string>();
  const handles = new Set<string>();
  const hoursByContact = new Map<string, Set<string>>();
  const linkHosts = new Set<string>(BANK_LINK_ALLOWLIST);
  const addHours = (k: string, h: any) => {
    const set = hoursByContact.get(k) ?? new Set<string>();
    if (h.type === "daily") set.add(`${h.open}–${h.close}`);
    if (h.type === "24h") set.add("24h");
    hoursByContact.set(k, set);
  };
  for (const s of services.services as any[]) {
    const keys: string[] = [];
    for (const ch of s.channels) {
      if (ch.type === "phone") { phones.add(ch.value); keys.push(ch.value); }
      if (ch.type === "line" && String(ch.value).startsWith("@")) { handles.add(ch.value); keys.push(ch.value.toLowerCase()); }
    }
    for (const hs of s.hours_sources) { for (const k of keys) addHours(k, hs.hours); if (hs.url) linkHosts.add(hostOf(hs.url)); }
    for (const src of s.sources) linkHosts.add(hostOf(src.url));
  }
  for (const c of services.crisis_lines as any[]) {
    phones.add(c.number);
    addHours(c.number, { type: "24h" });
    for (const src of c.sources) linkHosts.add(hostOf(src.url));
  }
  linkHosts.delete("");
  return { phones, handles, hoursByContact, linkHosts, copyStatus, today };
}

const files = import.meta.glob("../data/bank/*.json", { eager: true }) as Record<string, unknown>;

/** Files that ship in the app. Fixture/test JSON and quiz.json never enter BANK. */
export function isProductionBankFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  if (/quiz\.json$/i.test(base)) return false;
  return !/(?:^|[-_.])(?:fixture|pii-gate|test)(?:[-_.]|$)/i.test(base);
}

const production = Object.fromEntries(Object.entries(files).filter(([n]) => isProductionBankFile(n)));

/** Every card in the bundled bank (quiz.json and test fixtures excluded). */
export const BANK: BankCard[] = cardsFromFiles(production);
export const BANK_FILES: string[] = Object.keys(production);
