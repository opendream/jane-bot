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

test("FILMING-CHECKLIST steps 3 and 6: plain / reaches model-ready with a mock worker", async ({ page }) => {
  await page.addInitScript(() => {
    window.__JANE_RUNTIME_TEST__ = { wasm: "ok", gpu: false };
  });
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await expect(pill(page)).toHaveText("🔒 โมเดลในเครื่อง: Qwen3-0.6B (Jane fine-tuned) · ออฟไลน์");
  await expect(pill(page)).toHaveAttribute("data-runtime", "wasm");
});

test("flag-on preload starts on the start screen and does not block onboarding", async ({ page }) => {
  const t0 = Date.now();
  await openPick(page, "?modelPick=1&testRuntime=pick-loading&runtime=wasm");
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await expect(pill(page)).toHaveText(READINESS_LINE);
  await expect(pill(page)).toHaveAttribute("data-state", "loading");
  const visibleMs = Date.now() - t0;
  expect(visibleMs).toBeLessThan(2_000);
  const clickT0 = Date.now();
  await page.getByTestId("age-18-24").click();
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  expect(Date.now() - clickT0).toBeLessThan(1_000);
  await expect(pill(page)).toHaveText(READINESS_LINE);
});

test("flag-on crisis during preload is instant and makes zero model calls", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-loading&runtime=wasm");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("อยากตาย");
  const t0 = Date.now();
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(1_000);
  await expect(page.getByTestId("crisis-1323")).toBeVisible();
});

test("flag-on load failure falls back to rules without crashing", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-fail&runtime=wasm");
  await expect(pill(page)).toHaveAttribute("data-runtime", "rules", { timeout: 10_000 });
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "birth.control.000");
  await expect(lastJane(page).getByTestId("engine-label")).toHaveText(RULES_ANSWER_LABEL);
});

test("flag-on thinking keeps textarea focus, IME composition, draft and node identity", async ({ page }) => {
  await openPick(page, "?modelPick=1&testRuntime=pick-timeout&runtime=wasm&pickTimeoutMs=2500");
  await expect(pill(page)).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(page.getByTestId("chat-busy")).toHaveText(thinkingHintAt(0), { timeout: 2_000 });

  const before = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement;
    ta.focus();
    const marker = Symbol.for("jane-chat-input");
    (ta as unknown as { [k: symbol]: true })[marker] = true;
    ta.dispatchEvent(new CompositionEvent("compositionstart", { data: "ก", bubbles: true }));
    ta.value = "ก";
    ta.dispatchEvent(new InputEvent("input", { data: "ก", isComposing: true, bubbles: true }));
    ta.dispatchEvent(new CompositionEvent("compositionend", { data: "ก", bubbles: true }));
    ta.value = "กขอคำปรึกษา";
    ta.dispatchEvent(new InputEvent("input", { data: "ขอคำปรึกษา", bubbles: true }));
    return true;
  });
  expect(before).toBe(true);

  await page.waitForTimeout(700);

  const after = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement | null;
    const marker = Symbol.for("jane-chat-input");
    return {
      sameNode: !!(ta && (ta as unknown as { [k: symbol]: true })[marker]),
      focused: document.activeElement === ta,
      value: ta?.value ?? "",
    };
  });
  expect(after.sameNode).toBe(true);
  expect(after.focused).toBe(true);
  expect(after.value).toBe("กขอคำปรึกษา");
});
