import { test, expect, type Page } from "@playwright/test";
import { open, shot, assertNoStorage, assertNetwork, startAs } from "./helpers";

// v2 chat, rules only (?model=off). All typed text is SYNTHETIC.
async function openChat(page: Page, band = "15-17") {
  await startAs(page, band);
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
}
async function say(page: Page, text: string) {
  const n = await page.locator('[data-testid="chat-msg"][data-from="jane"]').count();
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
  return n;
}
const lastJane = (page: Page) => page.locator('[data-testid="chat-msg"][data-from="jane"]').last();

test("CH1 chat: welcome (PLACEHOLDER) → chip → follow-up chip → typed question, all verbatim, no network, no storage", async ({ page }) => {
  const rec = await open(page, "19:00");
  await openChat(page);
  await expect(lastJane(page)).toHaveAttribute("data-card", "general.welcome.000");
  await expect(lastJane(page).getByTestId("placeholder-tag")).toBeVisible();
  await shot(page, "ch1-01-welcome");
  await page.getByTestId("chat-chip-1").click(); // "กังวลเรื่องท้อง"
  await expect(lastJane(page)).toHaveAttribute("data-card", "pregnancy.p000");
  await page.getByTestId("chat-chip-0").click(); // follow-up → EC
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
  await say(page, "ช่วงนี้เครียดมาก นอนไม่หลับ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "mental_health.p000");
  await expect(lastJane(page)).toHaveAttribute("data-reworded", "false");
  await expect(lastJane(page)).toContainText("1323");
  await expect(page.getByTestId("not-medical-advice")).toBeVisible();
  await shot(page, "ch1-02-multi-turn");
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  expect(rec.consoleText.join("\n")).not.toContain("เครียดมาก");
});

test("CH2 crisis mid-chat (turn 3) → crisis screen, 1323 first; 'I'm safe now' returns to the same chat", async ({ page }) => {
  const rec = await open(page, "21:00");
  await openChat(page);
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "contraception.p000");
  await say(page, "แฟนกดดันให้มีอะไรด้วย");
  await expect(lastJane(page)).toHaveAttribute("data-card", "consent.p000");
  await say(page, "ไม่อยากมีชีวิตอยู่แล้ว");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.locator('[data-testid^="crisis-"]').first()).toHaveAttribute("data-testid", "crisis-1323");
  await shot(page, "ch2-01-crisis-mid-chat");
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(lastJane(page)).toHaveAttribute("data-card", "consent.p000");
  await say(page, "เครียดมาก");
  await expect(lastJane(page)).toHaveAttribute("data-card", "mental_health.p000");
  await assertNetwork(page, rec);
});

test("CH3 benign crisis word in chat → crisis strip, chat continues; guard refuses image requests", async ({ page }) => {
  await open(page, "14:00");
  await openChat(page, "18-24");
  await say(page, "ดูซีรีส์ที่มีฉากข่มขืน แล้วเครียดมาก"); // topic context → banner, not override
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(lastJane(page).getByTestId("crisis-banner")).toBeVisible();
  await say(page, "ส่งรูปให้ดูได้ไหม");
  await expect(lastJane(page)).toHaveAttribute("data-card", "general.refusal_image.000");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("CH4 quick exit mid-chat clears memory; erase starts over", async ({ page }) => {
  await open(page, "10:00");
  await openChat(page);
  await say(page, "เครียดมาก นอนไม่หลับทุกคืน");
  await expect(lastJane(page)).toHaveAttribute("data-card", "mental_health.p000");
  await page.getByTestId("quick-exit").click();
  await expect(page.getByTestId("screen-neutral")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("นอนไม่หลับ");
  await page.goto("/?model=off");
  await openChat(page);
  expect(await page.locator('[data-testid="chat-msg"]').count()).toBe(1); // only the welcome
  await say(page, "เครียดมาก");
  await page.getByTestId("erase").click();
  await expect(page.getByTestId("screen-start")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("เครียดมาก");
});

test("CH5 10-turn chat: zero requests, nothing stored, transcript capped at 20 messages", async ({ page }) => {
  const rec = await open(page, "16:00");
  await openChat(page);
  const lines = ["อยากรู้เรื่องคุมกำเนิด", "เครียดมาก", "ตรวจเอชได้ที่ไหน", "แฟนกดดัน", "วันนี้อากาศดี", "คุมฉุกเฉิน", "กลัวจะท้อง", "นอนไม่หลับ", "ติดเชื้อไหม", "ขอบคุณค่ะ"];
  for (const l of lines) { const n = await say(page, l); await expect(page.locator('[data-testid="chat-msg"][data-from="jane"]')).toHaveCount(Math.min(n + 1, 10)); }
  expect(await page.locator('[data-testid="chat-msg"]').count()).toBeLessThanOrEqual(20);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("CH6 talk to a person from chat shows the existing services list", async ({ page }) => {
  await open(page, "19:00");
  await openChat(page);
  await say(page, "ช่วงนี้เครียดมาก นอนไม่หลับ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "mental_health.p000");
  await expect(page.getByTestId("chat-offer")).toBeVisible();
  await say(page, "อยากคุยกับเจ้าหน้าที่");
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("service-hotline_1323")).toBeVisible();
});

test("CH7 hard-cap lock shows a notice; crisis text still opens the crisis screen", async ({ page }) => {
  await open(page, "11:00");
  await openChat(page);
  for (let i = 0; i < 30; i++) await say(page, "อยากรู้เรื่องทั่วไปค่ะ");
  await expect(page.getByTestId("cap-hard").first()).toBeVisible();
  await page.getByTestId("chat-input").fill("อยากตาย");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
});

test("CH8 stale classify does not overwrite the crisis screen", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=400");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
});

test("CH9 erase during classify does not put the need text back on screen", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=400");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await page.getByTestId("erase").click();
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("กลัวท้อง");
});

test("CH10 quick exit during classify stays on the neutral page", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=400");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await page.getByTestId("quick-exit").click();
  await expect(page.getByTestId("screen-neutral")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-neutral")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("กลัวท้อง");
});

test("CH11 late classify after opening chat does not pull the user to suggest", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=400");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("need-submit")).toHaveText("กำลังคิด…");
  await expect(page.getByTestId("open-chat")).toBeDisabled();
  // Native disabled buttons drop user clicks; dispatch still reaches the listener so the race is testable.
  await page.getByTestId("open-chat").dispatchEvent("click");
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
});
