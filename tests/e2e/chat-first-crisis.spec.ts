/**
 * Extra crisis check on chat-first (?chatFirst=1) and card-first (CHAT_FIRST off).
 * Stubbed model via ?testRuntime=. SYNTHETIC paraphrase only.
 * Existing crisis screen / helpline order, no new numbers.
 */
import { test, expect, type Page } from "@playwright/test";
import { startAs, crisisCallHrefs } from "./helpers";

const lastJane = (page: Page) => page.locator('[data-testid="chat-msg"][data-from="jane"]').last();

async function openStubbed(page: Page, extraQuery = "") {
  await page.goto(`/?testRuntime=pick-ok&runtime=wasm${extraQuery}`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
}

async function openChatFirst(page: Page) {
  await openStubbed(page, "&chatFirst=1");
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

async function modelCalls(page: Page) {
  return page.evaluate(() => window.__JANE_RUNTIME_CALLS__ ?? { chat: 0, pick: 0 });
}

test("?chatFirst=1 synthetic crisis paraphrase shows the existing crisis card with zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  expect(await modelCalls(page)).toEqual({ chat: 0, pick: 0 });

  // bt532 paraphrase: first-person harassment, missed by pinned crisis.ts.
  await say(page, "หนูถูกคุกคามที่ทำงาน");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.locator('[data-testid^="crisis-"]').first()).toHaveAttribute("data-testid", "crisis-191");
  expect(await crisisCallHrefs(page)).toEqual(["tel:191", "tel:1300"]);
  await expect(page.getByTestId("crisis-female-officer")).toHaveCount(0);

  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
  expect(JSON.stringify(calls)).not.toContain("คุกคาม");
});

test("card-first synthetic crisis paraphrase shows the existing crisis card with zero model calls", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  expect(await modelCalls(page)).toEqual({ chat: 0, pick: 0 });

  // bt532 paraphrase: first-person harassment, missed by pinned crisis.ts.
  await say(page, "หนูถูกคุกคามที่ทำงาน");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.locator('[data-testid^="crisis-"]').first()).toHaveAttribute("data-testid", "crisis-191");
  expect(await crisisCallHrefs(page)).toEqual(["tel:191", "tel:1300"]);
  await expect(page.getByTestId("crisis-female-officer")).toHaveCount(0);

  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
  expect(JSON.stringify(calls)).not.toContain("คุกคาม");
});

test("?chatFirst=1 a normal SRH question still reaches the stubbed model (control)", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page)).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat).toBeGreaterThan(0);
});
