/**
 * On-device model, WASM path (wllama + Qwen3-1.7B GGUF), in a persistent profile like the filming laptop.
 * 1) cold: weights download once from the local server into Cache Storage;
 * 2) warm: a fresh browser on the same profile loads the model with zero weight requests,
 *    and the whole flow (incl. model classification + polish) makes zero requests at all.
 * Needs `node scripts/fetch-weights.mjs` first; skipped if the GGUF is not installed.
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SHOTS, ORIGIN } from "./helpers";

const GGUF = "models/gguf/Qwen3-1.7B-Q4_K_M.gguf";
const PROFILE = path.join(os.tmpdir(), "srh-demo-e2e-model-profile");
test.skip(!fs.existsSync(GGUF), "weights not installed (run node scripts/fetch-weights.mjs)");
test.setTimeout(15 * 60_000);

async function launch(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE, {
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    baseURL: ORIGIN,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    serviceWorkers: "block",
  });
}

function record(page: Page) {
  const reqs: string[] = [];
  page.on("request", (r) => reqs.push(r.url()));
  page.on("websocket", (w) => reqs.push(w.url()));
  return reqs;
}

/** blob: URLs are in-memory worker scripts of our own origin, not network. */
const isLocal = (u: string) => u.startsWith(ORIGIN) || u.startsWith(`blob:${ORIGIN}/`);
const pill = (p: Page) => p.getByTestId("model-status");

test("WASM model: cold load caches weights; warm load + full flow make zero weight / zero flow requests", async () => {
  // ---------- cold (or already warm from a previous run) ----------
  fs.rmSync(PROFILE, { recursive: true, force: true });
  let ctx = await launch();
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  const coldReqs = record(page);
  const t0 = Date.now();
  await page.goto("/?runtime=wasm");
  await expect(pill(page)).toHaveAttribute("data-state", "loading", { timeout: 10_000 });
  // The referral flow is usable while the model loads.
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/m-01-model-loading.png` });
  await page.getByTestId("age-15-17").click();
  await expect(page.getByTestId("need-input")).toBeEditable();
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 10 * 60_000 });
  const coldMs = Date.now() - t0;
  await expect(pill(page)).toHaveAttribute("data-runtime", "wasm");
  await expect(pill(page)).toContainText("Qwen3");
  await expect(pill(page)).toContainText("ออฟไลน์");
  expect(coldReqs.some((u) => u.includes("/models/gguf/"))).toBe(true);
  for (const u of coldReqs) expect(isLocal(u), u).toBe(true);
  await ctx.close();

  // ---------- warm: new browser process, same profile ----------
  ctx = await launch();
  page = ctx.pages()[0] ?? (await ctx.newPage());
  const warm = record(page);
  // Any weight request now fails hard, so "ready" proves the weights came from Cache Storage.
  await page.route("**/models/**/*.gguf", (r) => r.abort());
  const t1 = Date.now();
  await page.clock.setFixedTime(new Date("2026-10-22T20:00:00+07:00"));
  await page.goto("/?runtime=wasm");
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 3 * 60_000 });
  const warmMs = Date.now() - t1;
  await page.screenshot({ path: `${SHOTS}/m-02-model-ready.png` });
  const weightReqs = warm.filter((u) => /\/models\/(gguf|webllm)\//.test(u));
  expect(weightReqs, "no weight downloads after the cache is warm").toEqual([]);
  for (const u of warm) expect(isLocal(u), `only 127.0.0.1: ${u}`).toBe(true);

  // Full flow with the model in the loop.
  await page.waitForLoadState("networkidle");
  const before = warm.length;
  await page.getByTestId("age-15-17").click();
  // Keyword-poor wording so rules are not confident and the model is actually asked.
  await page.getByTestId("need-input").fill("ช่วงนี้ไม่มีแรงทำอะไรเลย เบื่อทุกอย่าง");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible({ timeout: 30_000 });
  const label = page.getByTestId("intent-label");
  const source = await label.getAttribute("data-source");
  const intent = await label.getAttribute("data-intent");
  // Rules find nothing here ("other"); the model should place it (eval: 3 s median on this box, 8 s timeout).
  expect(source, "model was consulted and answered in time").toBe("model");
  expect(intent).toBe("mental_health");
  await page.screenshot({ path: `${SHOTS}/m-03-model-suggest.png`, fullPage: true });
  await page.locator('[data-testid^="pick-"]').first().click();
  await expect(page.getByTestId("screen-summary")).toBeVisible();
  // Polish is background-only; wait for it (or its timeout) without blocking anything.
  await page.getByTestId("polish-note").waitFor({ timeout: 25_000 }).catch(() => {});
  const polished = await page.getByTestId("polish-note").count();
  await page.screenshot({ path: `${SHOTS}/m-04-model-summary.png`, fullPage: true });
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  expect(warm.slice(before), "zero requests during the flow").toEqual([]);

  // Storage: only model files, under our origin; no chat text anywhere.
  const st = await page.evaluate(async () => {
    const urls = (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat();
    return { names: await caches.keys(), urls, local: localStorage.length, session: sessionStorage.length, cookie: document.cookie, idb: (await indexedDB.databases()).map((d) => d.name) };
  });
  expect(st.names).toEqual(["model-weights-v1"]);
  for (const u of st.urls) expect(u.startsWith(`${ORIGIN}/models/`), u).toBe(true);
  expect(st.urls.join(" ")).not.toMatch(/%E0%B8|แฟน/);
  expect(st.local + st.session).toBe(0);
  expect(st.cookie).toBe("");
  expect(st.idb).toEqual([]);

  fs.writeFileSync("test-results/model-wasm-timing.json", JSON.stringify({ coldMs, warmMs, source, intent, polished: polished > 0, warmRequests: warm.length }, null, 2));
  await ctx.close();
});
