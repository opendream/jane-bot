import { test, expect, type Page } from "@playwright/test";
import { open, shot, assertNoStorage, assertNetwork, startAs, citedHoursLines, crisisCallHrefs } from "./helpers";

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
  expect(await crisisCallHrefs(page)).toEqual(["tel:1323", "tel:1669"]);
  await expect(page.getByTestId("crisis-female-officer")).toHaveCount(0);
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

/* ---------------- in-chat referral (PR5). Expected hours come from services.json, not from the page. ---------------- */
const EC_TEXT = "ถุงยางรั่ว คุมฉุกเฉินทันไหม"; // SYNTHETIC

test("CH6 chat referral: offer → service cards (hours match services.json) → summary from her last message → approve → DEMO handoff", async ({ page }) => {
  const rec = await open(page, "19:00");
  await openChat(page);
  await say(page, EC_TEXT);
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
  await shot(page, "ch6-01-offer");
  await lastJane(page).getByTestId("chat-offer").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("intent-label")).toHaveAttribute("data-intent", "emergency_contraception");
  const cards = page.locator('[data-testid^="service-"]');
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  expect(await cards.count()).toBeLessThanOrEqual(3);
  for (const id of ["hotline_1663", "teen_club"]) {
    await expect(page.getByTestId(`service-${id}`)).toBeVisible();
    for (const line of citedHoursLines(id)) await expect(page.getByTestId(`hours-${id}`)).toContainText(line);
  }
  await expect(page.getByTestId("retell")).toHaveAttribute("data-to", "chat");
  await shot(page, "ch6-02-cards");
  await page.getByTestId("pick-hotline_1663").click();
  await expect(page.getByTestId("screen-summary")).toBeVisible();
  await expect(page.getByTestId("summary-input")).toHaveValue(/ถึงเจ้าหน้าที่ สายด่วน 1663/);
  await expect(page.getByTestId("summary-input")).toHaveValue(/ถุงยางรั่ว/);
  await expect(page.getByTestId("summary-input")).toHaveValue(/ช่วงอายุ: 15–17 ปี/);
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("screen-handoff")).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toContainText("nothing was sent");
  await shot(page, "ch6-03-handoff");
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  expect(rec.consoleText.join("\n")).not.toContain("ถุงยางรั่ว");
});

test("CH7 chat referral: back from cards and cancel from the summary both return to the same chat; 'talk to a person' opens referral", async ({ page }) => {
  const rec = await open(page, "20:00");
  await openChat(page, "18-24");
  await say(page, EC_TEXT);
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
  const before = await page.locator('[data-testid="chat-msg"]').count();
  await lastJane(page).getByTestId("chat-offer").click();
  await page.getByTestId("retell").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  expect(await page.locator('[data-testid="chat-msg"]').count()).toBe(before);
  await lastJane(page).getByTestId("chat-offer").click();
  await page.getByTestId("pick-teen_club").click();
  await expect(page.getByTestId("screen-summary")).toBeVisible();
  await page.getByTestId("cancel").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
  await say(page, "อยากคุยกับเจ้าหน้าที่");
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("intent-label")).toHaveAttribute("data-intent", "emergency_contraception");
  await assertNetwork(page, rec);
});

test("CH8 crisis typed into a chat-origin summary → crisis screen → 'I'm safe now' returns to the chat", async ({ page }) => {
  await open(page, "19:00");
  await openChat(page);
  await say(page, EC_TEXT);
  await lastJane(page).getByTestId("chat-offer").click();
  await page.getByTestId("pick-hotline_1663").click();
  const box = page.getByTestId("summary-input");
  await box.fill(`${await box.inputValue()}\nอยากตาย`);
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
});

test("CH9 talk to a person from chat shows the existing services list", async ({ page }) => {
  await open(page, "19:00");
  await openChat(page);
  await say(page, "ช่วงนี้เครียดมาก นอนไม่หลับ");
  await expect(lastJane(page)).toHaveAttribute("data-card", "mental_health.p000");
  await expect(page.getByTestId("chat-offer")).toBeVisible();
  await say(page, "อยากคุยกับเจ้าหน้าที่");
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("service-hotline_1323")).toBeVisible();
});

test("CH10 hard-cap lock shows a notice; crisis text still opens the crisis screen", async ({ page }) => {
  await open(page, "11:00");
  await openChat(page);
  for (let i = 0; i < 30; i++) await say(page, "อยากรู้เรื่องทั่วไปค่ะ");
  await expect(page.getByTestId("cap-hard").first()).toBeVisible();
  await page.getByTestId("chat-input").fill("อยากตาย");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
});

test("CH11 stale classify does not overwrite the crisis screen", async ({ page }) => {
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

test("CH12 erase during classify does not put the need text back on screen", async ({ page }) => {
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

test("CH13 quick exit during classify stays on the neutral page", async ({ page }) => {
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

test("CH14 SOS then continue back to describe re-enables buttons; crisis text still opens the crisis screen", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=400");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("need-submit")).toHaveText("กำลังคิด…");
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  await expect(page.getByTestId("need-submit")).toBeEnabled();
  await expect(page.getByTestId("need-submit")).toHaveText("หาที่ปรึกษา");
  await expect(page.getByTestId("open-chat")).toBeEnabled();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
  await expect(page.getByTestId("need-submit")).toBeEnabled();
  await page.getByTestId("need-input").fill("อยากตาย");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
});

test("CH15 erase then age re-pick re-enables buttons; crisis text still opens the crisis screen", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=400");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("need-submit")).toHaveText("กำลังคิด…");
  await page.getByTestId("erase").click();
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await page.getByTestId("age-18-24").click();
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  await expect(page.getByTestId("need-submit")).toBeEnabled();
  await expect(page.getByTestId("need-submit")).toHaveText("หาที่ปรึกษา");
  await expect(page.getByTestId("open-chat")).toBeEnabled();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
  await page.getByTestId("need-input").fill("อยากตาย");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
});

test("CH16 after continue, opening chat is a real click and a late classify cannot steal the screen", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=400");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("need-submit")).toHaveText("กำลังคิด…");
  await page.getByTestId("sos").click();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("open-chat")).toBeEnabled();
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
  await page.getByTestId("chat-input").fill("อยากตาย");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
});

async function markFocused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLTextAreaElement | null;
    if (el) (el as HTMLTextAreaElement & { __keep?: number }).__keep = 1;
    return { testid: el?.getAttribute("data-testid") ?? null, value: el?.value ?? null };
  });
}

async function focusedStill(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as (HTMLTextAreaElement & { __keep?: number }) | null;
    return {
      sameNode: !!(el && el.__keep === 1),
      testid: el?.getAttribute("data-testid") ?? null,
      value: el?.value ?? null,
    };
  });
}

test("CH17 late classify after SOS then continue does not steal describe focus or draft", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=800");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("need-submit")).toHaveText("กำลังคิด…");
  await page.getByTestId("sos").click();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  const box = page.getByTestId("need-input");
  await box.click();
  await box.pressSequentially(" เพิ่ม");
  const before = await markFocused(page);
  expect(before.testid).toBe("need-input");
  expect(before.value).toContain("เพิ่ม");
  await page.waitForTimeout(1000);
  const after = await focusedStill(page);
  expect(after.sameNode).toBe(true);
  expect(after.testid).toBe(before.testid);
  expect(after.value).toBe(before.value);
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
});

test("CH18 late classify after SOS then continue does not steal chat focus or draft", async ({ page }) => {
  await page.goto("/?model=off&classifyDelayMs=800");
  await startAs(page, "18-24");
  await page.getByTestId("need-input").fill("กลัวท้อง ประจำเดือนมาช้า");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("need-submit")).toHaveText("กำลังคิด…");
  await page.getByTestId("sos").click();
  await page.getByTestId("crisis-continue").click();
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  const box = page.getByTestId("chat-input");
  await box.click();
  await box.pressSequentially("ข้อความที่พิมพ์");
  const before = await markFocused(page);
  expect(before.testid).toBe("chat-input");
  expect(before.value).toBe("ข้อความที่พิมพ์");
  await page.waitForTimeout(1000);
  const after = await focusedStill(page);
  expect(after.sameNode).toBe(true);
  expect(after.testid).toBe(before.testid);
  expect(after.value).toBe(before.value);
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
});

test("CH19 slow chat turn after erase then quick exit never renders and focus stays", async ({ page }) => {
  await page.goto("/?model=off&chatDelayMs=800");
  await startAs(page, "18-24");
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await page.getByTestId("chat-input").fill("อยากตาย");
  await page.getByTestId("chat-send").click();
  await page.getByTestId("erase").click();
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await page.getByTestId("quick-exit").click();
  await expect(page.getByTestId("screen-neutral")).toBeVisible();
  await page.getByTestId("screen-neutral").click();
  const before = await markFocused(page);
  await page.waitForTimeout(1000);
  const after = await focusedStill(page);
  expect(after.sameNode).toBe(true);
  expect(after.testid).toBe(before.testid);
  await expect(page.getByTestId("screen-neutral")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(page.getByTestId("screen-chat")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("อยากตาย");
});

test("CH20 after a crisis override, talk-to-a-person keeps the sticky strip and 1323 on the EC cards", async ({ page }) => {
  await open(page, "19:00");
  await openChat(page);
  await say(page, EC_TEXT);
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
  await say(page, "อยากตาย");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await say(page, "อยากคุยกับเจ้าหน้าที่");
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  const strip = page.getByTestId("crisis-banner");
  await expect(strip).toBeVisible();
  await expect(strip.locator('a[href="tel:1323"]')).toBeVisible();
  await expect(page.getByTestId("service-hotline_1663")).toBeVisible();
  await expect(page.getByTestId("service-teen_club")).toBeVisible();
  await expect(page.getByTestId("service-yfhs")).toBeVisible();
});

test("CH21 news-topic suicide mention plus talk-to-a-person shows the strip from chat, not the crisis screen", async ({ page }) => {
  await open(page, "19:00");
  await openChat(page);
  await say(page, "ข่าววันนี้ เรื่องฆ่าตัวตาย อยากคุยกับเจ้าหน้าที่");
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  const strip = page.getByTestId("crisis-banner");
  await expect(strip).toBeVisible();
  await expect(strip.locator('a[href="tel:1323"]')).toBeVisible();
});

test("CH22 SOS from chat-opened cards or summary then I'm-safe-now returns to the same chat", async ({ page }) => {
  await open(page, "19:00");
  await openChat(page);
  await say(page, EC_TEXT);
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
  await lastJane(page).getByTestId("chat-offer").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(page.getByTestId("screen-describe")).toHaveCount(0);
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
  await lastJane(page).getByTestId("chat-offer").click();
  await page.getByTestId("pick-hotline_1663").click();
  await expect(page.getByTestId("screen-summary")).toBeVisible();
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await expect(page.getByTestId("screen-describe")).toHaveCount(0);
  await expect(lastJane(page)).toHaveAttribute("data-card", "ec.p000");
});
