/**
 * Forced GPU-failure path (test hook, no real WebGPU / weights).
 * SYNTHETIC chat text only. Checks the honest status pill and that a normal
 * answer-bank card still renders on rules while the runtime falls back.
 */
import { test, expect, type Page } from "@playwright/test";
import { SHOTS, startAs } from "./helpers";

const READY_PILL = "🔒 โมเดลในเครื่อง: Qwen3-1.7B · ออฟไลน์";
const RULES_PILL = "🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์";
const PREGNANCY_CARD =
  "กังวลเรื่องท้องใช้มั้ย";

const pill = (page: Page) => page.getByTestId("model-status");

async function openHook(page: Page, testRuntime: "gpu-lost" | "gpu-lost-rules") {
  await page.clock.setFixedTime(new Date("2026-10-22T19:00:00+07:00"));
  await page.goto(`/?model=qwen3-1.7b&testRuntime=${testRuntime}`);
  await page.waitForLoadState("domcontentloaded");
}

async function expectExactPregnancyCard(page: Page) {
  await startAs(page, "15-17");
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await page.getByTestId("chat-chip-1").click();
  const jane = page.locator('[data-testid="chat-msg"][data-from="jane"]').last();
  await expect(jane).toHaveAttribute("data-card", "pregnancy.ornot.000");
  await expect(jane).toHaveAttribute("data-reworded", "false");
  await expect(jane).toContainText(PREGNANCY_CARD);
}

test("GPU warm-up loss falls back to WASM; pill is honest; exact card still renders", async ({ page }) => {
  await openHook(page, "gpu-lost");
  await expect(pill(page)).toHaveAttribute("data-runtime", "wasm", { timeout: 10_000 });
  await expect(pill(page)).toHaveAttribute("data-state", "ready");
  await expect(pill(page)).toHaveText(READY_PILL);
  await expect(pill(page)).toHaveAttribute("title", /WASM/);
  await page.screenshot({ path: `${SHOTS}/runtime-fallback-wasm.png`, fullPage: false, scale: "css" });
  await expectExactPregnancyCard(page);
  const keys = await page.evaluate(() => Object.keys(sessionStorage));
  expect(keys).toEqual(["jane.webgpu.failed"]);
  expect(await page.evaluate(() => sessionStorage.getItem("jane.webgpu.failed"))).toBe("1");
});

test("GPU warm-up loss with no WASM falls back to rules; pill is the existing rules-only label", async ({ page }) => {
  await openHook(page, "gpu-lost-rules");
  await expect(pill(page)).toHaveAttribute("data-runtime", "rules", { timeout: 10_000 });
  await expect(pill(page)).toHaveText(RULES_PILL);
  await page.screenshot({ path: `${SHOTS}/runtime-fallback-rules.png`, fullPage: false, scale: "css" });
  await expectExactPregnancyCard(page);
});
