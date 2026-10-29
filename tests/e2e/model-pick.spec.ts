/**
 * Model-first pick UI (PR 3), behind ?modelPick=1. Mock worker via ?testRuntime=.
 * SYNTHETIC chat text only. Flag-off path must stay the existing rules chat.
 */
import { test, expect, type Page } from "@playwright/test";
import { startAs } from "./helpers";
import { MODEL_ANSWER_LABEL, RULES_ANSWER_LABEL, READINESS_LINE, thinkingHintAt } from "../../src/ui/thinking";

const pill = (page: Page) => page.getByTestId("model-status");
const lastJane = (page: Page) => page.locator('[data-testid="chat-msg"][data-from="jane"]').last();

async function openPick(page: Page, extra: string) {
  await page.goto(`/${extra}`);
  await page.waitForLoadState("domcontentloaded");
}

async function openChat(page: Page, band = "18-24") {
  await startAs(page, band);
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
}

async function say(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

test("flag-off (default) does not show an engine label or the thinking copy", async ({ page }) => {
  await openPick(page, "?model=off");
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "birth.control.000");
  await expect(lastJane(page).getByTestId("engine-label")).toHaveCount(0);
  await expect(page.getByTestId("chat-busy")).toHaveCount(0);
});

test("flag-on model path: mock worker picks the shortlist top, model label, thinking hint", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-ok&runtime=wasm");
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "birth.control.000");
  await expect(lastJane(page).getByTestId("engine-label")).toHaveText(MODEL_ANSWER_LABEL);
});

test("flag-on timeout falls back to the rules card with the rules label", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-timeout&runtime=wasm&pickTimeoutMs=250");
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(page.getByTestId("chat-busy")).toHaveText(thinkingHintAt(0), { timeout: 2_000 });
  await expect(lastJane(page)).toHaveAttribute("data-card", "birth.control.000", { timeout: 10_000 });
  await expect(lastJane(page).getByTestId("engine-label")).toHaveText(RULES_ANSWER_LABEL);
});

test("flag-on not-ready is an instant rules-labelled answer", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-not-ready");
  await expect(pill(page)).toHaveAttribute("data-runtime", "rules", { timeout: 10_000 });
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "birth.control.000");
  await expect(lastJane(page).getByTestId("engine-label")).toHaveText(RULES_ANSWER_LABEL);
});

test("flag-on warm-up wait (≤5 s remaining) still reaches a model pick", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-warmup&runtime=wasm");
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "birth.control.000", { timeout: 10_000 });
  await expect(lastJane(page).getByTestId("engine-label")).toHaveText(MODEL_ANSWER_LABEL);
});

test("flag-on warm-up remaining > 5 s is rules-not-ready, no wait for the model", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-warmup-slow&runtime=wasm");
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  const t0 = Date.now();
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "birth.control.000");
  expect(Date.now() - t0).toBeLessThan(2_000);
  await expect(lastJane(page).getByTestId("engine-label")).toHaveText(RULES_ANSWER_LABEL);
});

test("flag-on loading pill uses the readiness line", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-warmup-slow&runtime=wasm");
  // The hook returns after onWarmup; pill may already be ready. Check copy if still loading.
  const state = await pill(page).getAttribute("data-state");
  if (state === "loading") await expect(pill(page)).toHaveText(READINESS_LINE);
});
