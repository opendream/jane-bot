import { expect, type Page } from "@playwright/test";
import fs from "node:fs";

export const ORIGIN = "http://127.0.0.1:4173";
export const SHOTS = "e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const SERVICES_DATA = JSON.parse(fs.readFileSync("src/data/services.json", "utf8"));
export function serviceFromJson(id: string) {
  return SERVICES_DATA.services.find((x: { id: string }) => x.id === id);
}
/** Daily hours lines as shown on the card, taken from services.json (not from the page). */
export function citedHoursLines(id: string): string[] {
  return serviceFromJson(id).hours_sources
    .filter((h: { hours: { type: string } }) => h.hours.type === "daily")
    .map((h: { by: string; hours: { open: string; close: string } }) => `${h.by}: ทุกวัน ${h.hours.open}–${h.hours.close} น.`);
}
export function effectiveHoursLabel(id: string): string {
  const h = serviceFromJson(id).hours_sources[0].hours;
  return `ทุกวัน ${h.open}–${h.close} น.`;
}

/** Records every request the page makes. Flow requests = anything after the initial load. */
export async function open(page: Page, bkkTime: string, extraQuery = "") {
  const all: string[] = [];
  const consoleText: string[] = [];
  page.on("request", (r) => all.push(r.url()));
  page.on("console", (m) => consoleText.push(m.text()));
  page.on("websocket", (w) => all.push(w.url()));
  await page.clock.setFixedTime(new Date(`2026-10-22T${bkkTime}:00+07:00`));
  await page.goto(`/?model=off${extraQuery}`);
  await page.waitForLoadState("networkidle");
  const initial = all.length;
  return {
    all, consoleText,
    flowRequests: () => all.slice(initial),
  };
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Cache Storage may hold model files from /models/ only; nothing else may be stored anywhere. */
export async function assertNoStorage(page: Page) {
  const s = await page.evaluate(async () => ({
    nonModelCacheEntries: (await Promise.all((await caches.keys()).map(async (n) =>
      (await (await caches.open(n)).keys()).map((r) => r.url).filter((u) => !new URL(u).pathname.includes("/models/"))))).flat(),
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: (await indexedDB.databases()).length,
    cacheNames: (await caches.keys()).filter((n) => n !== "model-weights-v1"),
  }));
  expect(s).toEqual({ nonModelCacheEntries: [], local: 0, session: 0, cookie: "", idb: 0, cacheNames: [] });
}

export async function assertNetwork(page: Page, rec: Awaited<ReturnType<typeof open>>) {
  expect(rec.all.length, "recorder saw the initial page load").toBeGreaterThan(0);
  expect(rec.flowRequests(), "requests during the flow").toEqual([]);
  for (const u of rec.all) expect(u.startsWith(ORIGIN), `only local origin: ${u}`).toBe(true);
}

export async function startAs(page: Page, band: string) {
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await expect(page).toHaveTitle(/พี่เจน/);
  await expect(page.getByTestId("brand")).toContainText("พี่เจน");
  await expect(page.getByTestId("brand")).toContainText("Jane");
  await expect(page.getByTestId("mark-small").locator("svg")).toBeVisible();
  await expect(page.getByTestId("mark-hero").locator("svg")).toBeVisible();
  await expect(page.getByTestId("promise-medical")).toContainText("พี่เจน เป็น AI");
  await expect(page.getByTestId("promise-medical")).toContainText("ไม่ใช่คำแนะนำทางการแพทย์");
  await expect(page.getByTestId("promise-privacy")).toContainText("ไม่มีอะไรถูกส่งออกไป");
  await expect(page.getByTestId("promise-age")).toContainText("15 ปีขึ้นไป");
  await expect(page.getByTestId("quick-exit")).toBeVisible();
  await expect(page.getByTestId("draft-flag")).toBeVisible();
  await page.getByTestId(`age-${band}`).click();
}

export async function describe(page: Page, text: string) {
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  await page.getByTestId("need-input").fill(text);
}

/** Tap-to-call hrefs on the full crisis screen, in on-screen order (not the officer line). */
export function crisisCallHrefs(page: Page) {
  return page.locator('[data-testid="screen-crisis"] [data-testid^="crisis-"] a').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
}

/** Pinned crisis.ts strip order (all four, never hide). Category-first from the pin. */
export const STRIP_HREFS = {
  self_harm: ["tel:1323", "tel:1669", "tel:1300", "tel:191"],
  sexual_violence: ["tel:1300", "tel:191", "tel:1669", "tel:1323"],
  medical_emergency: ["tel:1669", "tel:191", "tel:1323", "tel:1300"],
} as const;

/** Tap-to-call hrefs on a crisis banner/strip, in on-screen order. */
export function crisisBannerHrefs(page: Page) {
  return page.getByTestId("crisis-banner").locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
}

