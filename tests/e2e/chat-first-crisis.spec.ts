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

test("?chatFirst=1 mostly-Thai English crisis word shows the existing crisis card with zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  expect(await modelCalls(page)).toEqual({ chat: 0, pick: 0 });
  await say(page, "หนูอยาก die ค่ะ");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first mostly-Thai English crisis word shows the existing crisis card with zero model calls", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  expect(await modelCalls(page)).toEqual({ chat: 0, pick: 0 });
  await say(page, "หนูรู้สึก suicidal มาหลายวันแล้ว");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("?chatFirst=1 exact English crisis phrase shows the existing crisis card with zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "I'm suicidal");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first exact English crisis phrase shows the existing crisis card with zero model calls", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "wanna die");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("?chatFirst=1 bare help line stays on the card with zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "help");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page)).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first bare help line stays on the card with zero model calls", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "please help");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page)).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first negated wanna-die HIV question is CLEAR under option 1", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "I don't really wanna die, is HIV curable");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("?chatFirst=1 don't-want-to-live shows the existing crisis card with zero model calls", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  expect(await modelCalls(page)).toEqual({ chat: 0, pick: 0 });
  await say(page, "I don't want to live");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first razor self-harm disclosure shows the existing crisis card with zero model calls", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "หนู cut ตัวเองด้วยมีดโกนทุกคืน");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first side-effect question with a crisis word is CLEAR under option 1", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "ยาคุมทำให้รู้สึก suicidal ได้ไหม");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first vague distress shows the card, DRAFT soft line, and button; button opens existing crisis screen; zero model calls", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page)).toBeVisible();
  await expect(page.getByTestId("chat-crisis-soft-line")).toHaveText("ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะคะ");
  await expect(page.getByTestId("chat-crisis-soft-open")).toBeVisible();
  const before = await modelCalls(page);
  expect(before.chat + before.pick).toBe(0);
  await page.getByTestId("chat-crisis-soft-open").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.locator('[data-testid^="crisis-"]').first()).toBeVisible();
  const after = await modelCalls(page);
  expect(after.chat + after.pick).toBe(0);
});

test("?chatFirst=1 Thai AMBIGUOUS shows the card plus the DRAFT line, 0 model calls; the button opens the existing crisis screen", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "ช่วงนี้กังวลเรื่องแฟน");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  const afterNone = await modelCalls(page);
  expect(afterNone.chat).toBeGreaterThan(0);

  await page.reload();
  await openChatFirst(page);
  await openChat(page);
  await say(page, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page)).toBeVisible();
  await expect(lastJane(page).getByTestId("chat-text")).not.toHaveText("พี่อยู่ตรงนี้นะ น้องเล่าเพิ่มได้เลย");
  await expect(page.getByTestId("chat-crisis-soft-line")).toHaveText("ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะคะ");
  await expect(page.getByTestId("chat-crisis-soft-open")).toBeVisible();
  await expect(page.getByTestId("chat-thinking")).toHaveCount(0);
  const afterAmb = await modelCalls(page);
  expect(afterAmb.chat + afterAmb.pick).toBe(0);
  await page.getByTestId("chat-crisis-soft-open").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.locator('[data-testid^="crisis-"]').first()).toBeVisible();
});

test("?chatFirst=1 English don't-want-to-live-in-fear is CLEAR under option 1", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "I don't want to live in fear of HIV, should I take PrEP");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("?chatFirst=1 English AMBIGUOUS makes zero model calls and shows the card plus the DRAFT line", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "I feel so hopeless about everything");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page)).toBeVisible();
  await expect(page.getByTestId("chat-crisis-soft-line")).toHaveText("ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะคะ");
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("?chatFirst=1 Thai AMBIGUOUS when the model is not ready shows the card plus the DRAFT line", async ({ page }) => {
  await page.goto("/?testRuntime=pick-not-ready&chatFirst=1");
  await page.waitForLoadState("domcontentloaded");
  await openChat(page);
  await say(page, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page)).toBeVisible();
  await expect(page.getByTestId("chat-crisis-soft-line")).toHaveText("ถ้าตอนนี้รู้สึกไม่ปลอดภัย กดตรงนี้ได้เลยนะคะ");
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first reflexive self-cut naming the razor stays on the existing crisis screen", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "หนู cut ตัวเองด้วยมีดโกนที่ใช้โกนขนทุกคืน");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  const calls = await modelCalls(page);
  expect(calls.chat + calls.pick).toBe(0);
});

test("card-first AMBIGUOUS is not inherited by a later unrelated turn", async ({ page }) => {
  await openStubbed(page);
  await openChat(page);
  await say(page, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง");
  await expect(page.getByTestId("chat-crisis-soft-line")).toBeVisible();
  await say(page, "ถุงยางราคาเท่าไหร่");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page).getByTestId("chat-crisis-soft-line")).toHaveCount(0);
});

test("?chatFirst=1 later unrelated turn after AMBIGUOUS has no soft line and calls the model", async ({ page }) => {
  await openChatFirst(page);
  await openChat(page);
  await say(page, "หนูสิ้นหวังมาก ไม่รู้จะไปต่อยังไง");
  await expect(page.getByTestId("chat-crisis-soft-line")).toBeVisible();
  const afterFirst = await modelCalls(page);
  expect(afterFirst.chat + afterFirst.pick).toBe(0);
  await say(page, "ถุงยางราคาเท่าไหร่");
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(lastJane(page).getByTestId("chat-crisis-soft-line")).toHaveCount(0);
  const afterSecond = await modelCalls(page);
  expect(afterSecond.chat + afterSecond.pick).toBeGreaterThan(afterFirst.chat + afterFirst.pick);
});
