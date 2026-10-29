/**
 * Chat-first on the production build via ?chatFirst=1. Mock worker via ?testRuntime=chat-ok.
 * SYNTHETIC chat text only.
 */
import { test, expect, type Page } from "@playwright/test";
import { startAs } from "./helpers";
import { SHOW_CARD_NOW } from "../../src/core/chat-flow";
import { CARD_THAI_NOTE_EN } from "../../src/core/card-lang";

const lastJane = (page: Page) => page.locator('[data-testid="chat-msg"][data-from="jane"]').last();

async function openChatFirst(page: Page) {
  await page.goto("/?chatFirst=1&testRuntime=chat-ok&runtime=wasm");
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

test("turn 3 of a stubbed chat-first topic closes with a bank card", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("พี่อยู่ตรงนี้นะ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  await say(page, "แฟนไม่ยอมคุยด้วย");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  await say(page, "แล้วหนูควรพูดยังไงดี");
  await expect(lastJane(page)).toHaveAttribute("data-card", /.+/);
});

test("ขอข้อมูลเลย chip after a chat turn shows a bank card with no extra model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("พี่อยู่ตรงนี้นะ");
  const before = await modelCalls(page);
  expect(before.chat).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: SHOW_CARD_NOW })).toBeVisible();
  await page.getByRole("button", { name: SHOW_CARD_NOW }).click();
  await expect(lastJane(page)).toHaveAttribute("data-card", /.+/);
  const after = await modelCalls(page);
  expect(after.chat).toBe(before.chat);
  expect(after.pick).toBe(before.pick);
});

test("a crisis message makes zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  const before = await modelCalls(page);
  expect(before.chat).toBe(0);
  expect(before.pick).toBe(0);
  await say(page, "อยากตาย");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const after = await modelCalls(page);
  expect(after.chat).toBe(0);
  expect(after.pick).toBe(0);
});

test("an English question shows a bank card with the DRAFT note and zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  const before = await modelCalls(page);
  expect(before.chat).toBe(0);
  expect(before.pick).toBe(0);
  await say(page, "I want to know about birth control");
  await expect(lastJane(page)).toHaveAttribute("data-card", /.+/);
  await expect(lastJane(page).getByTestId("card-lang-note")).toHaveText(CARD_THAI_NOTE_EN);
  const after = await modelCalls(page);
  expect(after.chat).toBe(0);
  expect(after.pick).toBe(0);
});

test("English disclosures show the existing crisis screen with zero model calls", async ({ page }) => {
  const lines = [
    "I was forced to have sex",
    "I don't want to live anymore",
    "my boyfriend hits me and I am scared",
    "I was sexually assaulted and I am scared",
    "I want to hurt myself",
    "I don't want to be alive",
  ];
  for (const line of lines) {
    await openChatFirst(page);
    await openChat(page);
    const before = await modelCalls(page);
    expect(before.chat, line).toBe(0);
    expect(before.pick, line).toBe(0);
    await say(page, line);
    await expect(page.getByTestId("screen-crisis"), line).toBeVisible();
    const after = await modelCalls(page);
    expect(after.chat, line).toBe(0);
    expect(after.pick, line).toBe(0);
  }
});

test("an English crisis-like message makes zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  const before = await modelCalls(page);
  expect(before.chat).toBe(0);
  expect(before.pick).toBe(0);
  await say(page, "I want to die");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const after = await modelCalls(page);
  expect(after.chat).toBe(0);
  expect(after.pick).toBe(0);
});
