/**
 * Chat-first is the production default. Mock worker via ?testRuntime=chat-ok.
 * Opt out with ?chatFirst=0. SYNTHETIC chat text only.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { startAs } from "./helpers";
import { SHOW_CARD_NOW } from "../../src/core/chat-flow";
import { CARD_THAI_NOTE_EN } from "../../src/core/card-lang";

const LEAK_ANSWER = (
  JSON.parse(fs.readFileSync("src/data/bank/contraception.json", "utf8")) as {
    cards: { id: string; answer_th: string }[];
  }
).cards.find((c) => c.id === "condom.leak.000")!.answer_th;

const lastJane = (page: Page) => page.locator('[data-testid="chat-msg"][data-from="jane"]').last();

async function openChatFirst(page: Page) {
  await page.goto("/?testRuntime=chat-ok&runtime=wasm");
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

test("ขอข้อมูลเลย after a chat turn shows the bank card once", async ({ page }) => {
  await page.goto("/?testRuntime=chat-ok&runtime=wasm");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "ถุงยางแตกต้องทำยังไง");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("เราฟังอยู่นะคะ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  await page.getByRole("button", { name: SHOW_CARD_NOW }).click();
  await expect(page.locator('[data-testid="chat-msg"][data-from="jane"][data-card="condom.leak.000"]')).toHaveCount(1);
  const texts = await page.locator('[data-testid="chat-text"]').allTextContents();
  expect(texts.filter((t) => t.includes(LEAK_ANSWER))).toHaveLength(1);
});

test("turns 3–5 of a stubbed chat stay on the model with no forced card", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("เราฟังอยู่นะคะ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  await say(page, "แฟนไม่ยอมคุยด้วย");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  await say(page, "แล้วหนูควรพูดยังไงดี");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("เราฟังอยู่นะคะ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  await say(page, "หนูยังคิดไม่ออก");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  await say(page, "เล่าต่ออีกได้ไหม");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
});

test("ขอข้อมูลเลย chip after a chat turn shows a bank card with no extra model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("เราฟังอยู่นะคะ");
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
    "I'm suicidal",
    "wanna die",
    "end my life",
    "I was sexually assaulted and I am scared",
    "killing myself",
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

test("I don't wanna die, is HIV curable is CLEAR under option 1 with zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  const before = await modelCalls(page);
  expect(before.chat).toBe(0);
  expect(before.pick).toBe(0);
  await say(page, "I don't wanna die, is HIV curable");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const after = await modelCalls(page);
  expect(after.chat).toBe(0);
  expect(after.pick).toBe(0);
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

async function openChatFirstPick(page: Page) {
  await page.goto("/?testRuntime=chat-ok&runtime=wasm");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
}

test("thanks after a condom topic does not show that card on the thanks turn", async ({ page }) => {
  await openChatFirstPick(page);
  await openChat(page);
  await say(page, "ถุงยางแตกค่ะ");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("เราฟังอยู่นะคะ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  const before = await modelCalls(page);
  await say(page, "ขอบคุณค่ะ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "");
  const cardAfterThanks = page.locator('[data-testid="chat-msg"][data-from="user"]').filter({ hasText: "ขอบคุณค่ะ" })
    .locator("xpath=following-sibling::*[@data-testid='chat-msg' and @data-from='jane'][@data-card='condom.leak.000']");
  await expect(cardAfterThanks).toHaveCount(0);
  const after = await modelCalls(page);
  expect(after.chat).toBe(before.chat);
  expect(after.pick).toBe(before.pick);
});

test("chat-guard debug line is off by default and unused when the stub passes", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("เราฟังอยู่นะคะ");
  await expect(page.getByTestId("chat-guard-debug")).toHaveCount(0);
});

test("?debug=1 still hides the debug line when the stub passes the guard", async ({ page }) => {
  await page.goto("/?testRuntime=chat-ok&runtime=wasm&debug=1");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(lastJane(page).getByTestId("chat-text")).toContainText("เราฟังอยู่นะคะ");
  await expect(page.getByTestId("chat-guard-debug")).toHaveCount(0);
});

test("thanks sent mid-generation drops the ack and answers the remaining question", async ({ page }) => {
  await page.goto("/?testRuntime=chat-ok&runtime=wasm&chatReplyMs=1500");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await openChat(page);
  await say(page, "ถุงยางแตกต้องทำยังไง");
  await expect(page.getByTestId("chat-thinking")).toBeVisible({ timeout: 2_000 });
  await say(page, "ขอบคุณค่ะ");
  await expect(lastJane(page)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
});
