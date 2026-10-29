/**
 * Chat-first thinking indicator (?chatFirst=1). Stubbed slow generation via chatReplyMs.
 * SYNTHETIC chat text only. Never user content.
 */
import { test, expect, type Page } from "@playwright/test";
import { startAs } from "./helpers";
import { SHOW_CARD_NOW } from "../../src/core/chat-flow";
import { CHAT_THINKING_PHRASES, thinkingLabelFor, thinkingPhraseAt } from "../../src/ui/chat-thinking";

const lastJane = (page: Page) => page.locator('[data-testid="chat-msg"][data-from="jane"]').last();

async function openChatFirstSlow(page: Page, extra = "") {
  await page.goto(`/?chatFirst=1&testRuntime=chat-ok&runtime=wasm&chatReplyMs=1500${extra}`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
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

function modelCalls(page: Page) {
  return page.evaluate(() => window.__JANE_RUNTIME_CALLS__ ?? { chat: 0, pick: 0 });
}

test("thinking indicator is visible during a stubbed slow generation, gone after, and not in the transcript", async ({ page }) => {
  await openChatFirstSlow(page);
  await openChat(page);
  const before = await modelCalls(page);
  expect(before.chat).toBe(0);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(page.getByTestId("chat-thinking")).toBeVisible({ timeout: 2_000 });
  await expect(page.getByTestId("chat-thinking-label")).toHaveText(thinkingLabelFor("th"));
  await expect(page.getByTestId("chat-thinking-phrase")).toHaveText(thinkingPhraseAt("th", 0));
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("พี่อยู่ตรงนี้นะ", { timeout: 8_000 });
  await expect(page.getByTestId("chat-thinking")).toHaveCount(0);
  const log = page.getByTestId("chat-log");
  await expect(log.getByTestId("chat-thinking")).toHaveCount(0);
  for (const phrase of CHAT_THINKING_PHRASES.th) {
    await expect(log.getByText(phrase, { exact: true })).toHaveCount(0);
  }
  const after = await modelCalls(page);
  expect(after.chat).toBe(before.chat + 1);
});

test("reduced-motion shows one static phrase with no bobbing animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?chatFirst=1&testRuntime=chat-ok&runtime=wasm&chatReplyMs=4000");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  const phrase = page.getByTestId("chat-thinking-phrase");
  await expect(phrase).toBeVisible({ timeout: 2_000 });
  await expect(phrase).toHaveText(thinkingPhraseAt("th", 0));
  const anim = await phrase.evaluate((el) => getComputedStyle(el).animationName);
  expect(anim === "none" || anim === "").toBe(true);
  await page.waitForTimeout(2_800);
  await expect(page.getByTestId("chat-thinking-phrase")).toHaveText(thinkingPhraseAt("th", 0));
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("พี่อยู่ตรงนี้นะ", { timeout: 10_000 });
  await expect(page.getByTestId("chat-thinking")).toHaveCount(0);
});

test("crisis screen has no thinking indicator", async ({ page }) => {
  await openChatFirstSlow(page);
  await openChat(page);
  const before = await modelCalls(page);
  expect(before.chat).toBe(0);
  await say(page, "อยากตาย");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.getByTestId("chat-thinking")).toHaveCount(0);
  const after = await modelCalls(page);
  expect(after.chat).toBe(before.chat);
  expect(after.pick).toBe(before.pick);
});

test("AMBIGUOUS extra-check never shows thinking, never calls the model, and the DRAFT soft line sits on the grouped card", async ({ page }) => {
  await openChatFirstSlow(page);
  await openChat(page);
  const before = await modelCalls(page);
  expect(before.chat).toBe(0);
  await say(page, "ยาคุมทำให้รู้สึก suicidal ได้ไหม");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(page.getByTestId("chat-thinking")).toHaveCount(0);
  const jane = lastJane(page);
  await expect(jane).toHaveAttribute("data-card", /.+/);
  await expect(jane.getByTestId("chat-crisis-soft-line")).toHaveText("ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะ");
  await expect(jane.getByTestId("chat-crisis-soft-open")).toBeVisible();
  const log = page.getByTestId("chat-log");
  await expect(log.getByTestId("chat-crisis-soft-open")).toBeVisible();
  await expect(log.getByTestId("chat-thinking")).toHaveCount(0);
  const after = await modelCalls(page);
  expect(after.chat).toBe(before.chat);
  expect(after.pick).toBe(before.pick);
  await page.getByTestId("chat-crisis-soft-open").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.getByTestId("chat-thinking")).toHaveCount(0);
});

test("ขอข้อมูลเลย stays available mid-generation and shows a card with no extra model calls", async ({ page }) => {
  await openChatFirstSlow(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(page.getByTestId("chat-thinking")).toBeVisible({ timeout: 2_000 });
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("พี่อยู่ตรงนี้นะ", { timeout: 8_000 });
  const before = await modelCalls(page);
  expect(before.chat).toBeGreaterThan(0);
  await say(page, "แฟนไม่ยอมคุยด้วย");
  await expect(page.getByTestId("chat-thinking")).toBeVisible({ timeout: 2_000 });
  await expect(page.getByRole("button", { name: SHOW_CARD_NOW })).toBeVisible();
  await page.getByRole("button", { name: SHOW_CARD_NOW }).click();
  await expect(page.getByTestId("chat-thinking")).toHaveCount(0);
  await expect(lastJane(page)).toHaveAttribute("data-card", /.+/);
  const after = await modelCalls(page);
  expect(after.chat).toBe(before.chat);
});
