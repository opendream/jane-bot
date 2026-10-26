import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { open, shot, assertNoStorage, assertNetwork, startAs, crisisBannerHrefs, STRIP_HREFS } from "./helpers";

const QUIZ = JSON.parse(fs.readFileSync("src/data/bank/quiz.json", "utf8")) as { items: { id: string; prompt_th: string; explanation_th: string }[] };
const QUIZ_WRAP = "ขอบคุณที่ลองทำควิซนะ กลับไปคุยกับพี่เจนต่อได้เลย";
const QUIZ_OK = "ถูกต้อง";
const QUIZ_NO = "ยังไม่ถูก";
const QUIZ_PRAISE = /เก่งมาก|ใช่เลย|เยี่ยม(?:มาก)?|สุดยอด|well done/i;
const q = (id: string) => QUIZ.items.find((x) => x.id === id)!;

async function openChat(page: Page, band: string) {
  await startAs(page, band);
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
}

async function say(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

const lastJane = (page: Page) => page.locator('[data-testid="chat-msg"][data-from="jane"]').last();

test("D7 true/false after a related contraception answer", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await say(page, "ใช้ถุงยาง");
  await expect(page.locator('[data-testid="chat-msg"][data-from="jane"]').last()).toHaveAttribute("data-card", "contraception.p000");
  await expect(page.getByTestId("quiz-start")).toHaveText("ลองทำควิซ");
  await page.getByTestId("quiz-start").click();
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-format", "true_false");
  await expect(page.getByTestId("quiz-prompt")).toHaveText(q("QZ-01").prompt_th);
  await expect(page.getByTestId("quiz-stop")).toBeVisible();
  await shot(page, "d7-01-true-false");
  await page.getByTestId("quiz-opt-1").click();
  await expect(page.getByTestId("quiz-result")).toHaveText(QUIZ_OK);
  await expect(page.getByTestId("quiz-explain")).toHaveText(q("QZ-01").explanation_th);
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 multiple choice after a related EC answer", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await page.getByTestId("chat-chip-0").click(); // ยาคุมฉุกเฉิน
  await expect(page.locator('[data-testid="chat-msg"][data-from="jane"]').last()).toHaveAttribute("data-card", "ec.p000");
  await page.getByTestId("quiz-start").click();
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-format", "multiple_choice");
  await expect(page.getByTestId("quiz-prompt")).toHaveText(q("QZ-04").prompt_th);
  await shot(page, "d7-02-multiple-choice");
  await page.getByTestId("quiz-opt-2").click();
  await expect(page.getByTestId("quiz-result")).toHaveText(QUIZ_OK);
  await expect(page.getByTestId("quiz-explain")).toContainText("ปรึกษาฟรี ทุกวัน 09:00–21:00 น.");
  await expect(page.getByTestId("quiz-explain")).not.toContainText("รวมวันหยุด");
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 chat-style multiple choice (QZ-05) after a consent answer", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await say(page, "แฟนกดดัน");
  await expect(page.locator('[data-testid="chat-msg"][data-from="jane"]').last()).toHaveAttribute("data-card", "consent.p000");
  await page.getByTestId("quiz-start").click();
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-format", "multiple_choice_chat");
  await expect(page.getByTestId("quiz-prompt")).toHaveText(q("QZ-05").prompt_th);
  await shot(page, "d7-03-chat-style");
  await page.getByTestId("quiz-opt-1").click();
  await expect(page.getByTestId("quiz-result")).toHaveText(QUIZ_OK);
  await expect(page.getByTestId("quiz-explain")).toHaveText(q("QZ-05").explanation_th);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 ordering uses up/down buttons (18+ contraception session)", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "18+");
  await say(page, "ใช้ถุงยาง");
  await page.getByTestId("quiz-start").click();
  // Session: QZ-01, QZ-03, QZ-07 — skip the first true/false.
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-id", "QZ-01");
  await page.getByTestId("quiz-opt-1").click();
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-format", "ordering");
  await expect(page.getByTestId("quiz-prompt")).toHaveText(q("QZ-03").prompt_th);
  await expect(page.getByTestId("quiz-up-0")).toBeVisible();
  await expect(page.getByTestId("quiz-down-0")).toBeVisible();
  await page.getByTestId("quiz-down-0").click();
  await page.getByTestId("quiz-up-1").click();
  await shot(page, "d7-04-ordering");
  await page.getByTestId("quiz-confirm").click();
  await expect(page.getByTestId("quiz-explain")).toHaveText(q("QZ-03").explanation_th);
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-id", "QZ-07");
  await shot(page, "d7-05-qz07-long-option");
  await page.getByTestId("quiz-opt-3").click();
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-wrap")).toHaveText(QUIZ_WRAP);
  await page.getByTestId("quiz-back").click();
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 15–17 never sees 18+ items (QZ-02 / QZ-03)", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await page.getByTestId("quiz-menu").click();
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await page.getByTestId("quiz-panel").getAttribute("data-id");
    seen.push(id ?? "");
    expect(id).not.toBe("QZ-02");
    expect(id).not.toBe("QZ-03");
    const prompt = await page.getByTestId("quiz-prompt").innerText();
    expect(prompt).not.toBe(q("QZ-02").prompt_th);
    expect(prompt).not.toBe(q("QZ-03").prompt_th);
    if (await page.getByTestId("quiz-confirm").count()) await page.getByTestId("quiz-confirm").click();
    else await page.getByTestId("quiz-opt-0").click();
    await page.getByTestId("quiz-next").click();
  }
  await expect(page.getByTestId("quiz-wrap")).toBeVisible();
  expect(seen).toHaveLength(3);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 crisis phrase mid-quiz is recorded: sticky all-four strip, soft referral, suggest banner", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await say(page, "ไม่อยากมีชีวิตอยู่แล้ว");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await expect(page.getByTestId("crisis-continue")).toContainText("ฉันปลอดภัยแล้ว");
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await say(page, "อยากรู้เรื่องคุมกำเนิด");
  await expect(lastJane(page)).toHaveAttribute("data-card", "contraception.p000");
  await expect(lastJane(page).getByTestId("crisis-banner")).toBeVisible();
  expect(await crisisBannerHrefs(page)).toEqual([...STRIP_HREFS.self_harm]);
  await expect(lastJane(page).getByTestId("chat-offer")).toBeVisible();
  await lastJane(page).getByTestId("chat-offer").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("crisis-banner")).toBeVisible();
  expect(await crisisBannerHrefs(page)).toEqual([...STRIP_HREFS.self_harm]);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 production ignores ?copy=reviewed: both quiz entry points still follow THAI_COPY_STATUS", async ({ page }) => {
  const rec = await open(page, "14:00", "&copy=reviewed");
  await openChat(page, "18+");
  await expect(lastJane(page)).toHaveAttribute("data-card", "general.welcome.000");
  await expect(lastJane(page).getByTestId("placeholder-tag")).toBeVisible();
  await expect(page.getByTestId("quiz-menu")).toBeVisible();
  await say(page, "ใช้ถุงยาง");
  await expect(lastJane(page)).toHaveAttribute("data-card", "contraception.p000");
  await expect(page.getByTestId("quiz-start")).toBeVisible();
  await expect(page.getByTestId("quiz-menu")).toBeVisible();
  await page.getByTestId("quiz-start").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 non-crisis text mid-quiz shows the bubble, drops the panel, and does not duplicate on a rapid second send", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  const text = "อยากรู้เรื่องคุมกำเนิด";
  await page.getByTestId("chat-input").fill(text);
  await page.evaluate(() => {
    const w = window as unknown as { __sawBusy?: boolean; __quizGoneWhileBusy?: boolean };
    w.__sawBusy = false;
    w.__quizGoneWhileBusy = false;
    const obs = new MutationObserver(() => {
      const busy = !!document.querySelector('[data-testid="chat-busy"]');
      const quiz = !!document.querySelector('[data-testid="quiz-panel"]');
      if (busy) {
        w.__sawBusy = true;
        if (!quiz) w.__quizGoneWhileBusy = true;
      }
    });
    obs.observe(document.body, { subtree: true, childList: true });
  });
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-send").click();
  const flash = await page.evaluate(() => {
    const w = window as unknown as { __sawBusy?: boolean; __quizGoneWhileBusy?: boolean };
    return { sawBusy: !!w.__sawBusy, quizGoneWhileBusy: !!w.__quizGoneWhileBusy };
  });
  expect(flash.sawBusy).toBe(true);
  expect(flash.quizGoneWhileBusy).toBe(true);
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  const userHits = page.locator('[data-testid="chat-msg"][data-from="user"]').filter({ hasText: text });
  await expect(userHits).toHaveCount(1);
  await expect(lastJane(page)).toHaveAttribute("data-card", "contraception.p000");
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await expect(page.getByTestId("chat-busy")).toHaveCount(0);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 QZ-03 shuffled-order immediate confirm is wrong and has no praise", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "18+");
  await say(page, "ใช้ถุงยาง");
  await page.getByTestId("quiz-start").click();
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-id", "QZ-01");
  await page.getByTestId("quiz-opt-1").click();
  await page.getByTestId("quiz-next").click();
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-id", "QZ-03");
  await expect(page.getByTestId("quiz-panel")).toHaveAttribute("data-format", "ordering");
  await page.getByTestId("quiz-confirm").click();
  await expect(page.getByTestId("quiz-result")).toHaveText(QUIZ_NO);
  const view = `${await page.getByTestId("quiz-result").innerText()}\n${await page.getByTestId("quiz-explain").innerText()}`;
  expect(view).not.toMatch(QUIZ_PRAISE);
  await expect(page.getByTestId("quiz-explain")).toHaveText(q("QZ-03").explanation_th);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 hard cap mid-quiz closes the panel; read-only hides quiz entry and crisis still fires", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  for (let i = 0; i < 29; i++) await say(page, "อยากรู้เรื่องทั่วไปค่ะ");
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  const capLine = "อยากรู้เรื่องคุมกำเนิด";
  await say(page, capLine);
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await expect(page.getByTestId("cap-hard").first()).toBeVisible();
  await expect(page.locator('[data-testid="chat-msg"][data-from="user"]').filter({ hasText: capLine })).toHaveCount(1);
  await expect(page.getByTestId("quiz-menu")).toHaveCount(0);
  await expect(page.getByTestId("quiz-start")).toHaveCount(0);
  const extra = "วันนี้อากาศดีจังเลยค่ะ";
  await page.getByTestId("chat-input").fill(extra);
  await page.getByTestId("chat-send").click();
  await page.getByTestId("chat-send").click();
  await expect(page.locator('[data-testid="chat-msg"][data-from="user"]').filter({ hasText: extra })).toHaveCount(0);
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await expect(page.getByTestId("cap-hard").first()).toBeVisible();
  await say(page, "อยากตาย");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 delayed 30th send: quiz stays closed, cap notice and referral offer show, no duplicate bubble", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  for (let i = 0; i < 29; i++) await say(page, "อยากรู้เรื่องทั่วไปค่ะ");
  await expect(page.getByTestId("quiz-menu")).toBeVisible();
  await page.evaluate(() => history.replaceState(null, "", `${location.pathname}?model=off&chatDelayMs=800`));
  const capLine = "อยากรู้เรื่องคุมกำเนิด";
  await page.getByTestId("chat-input").fill(capLine);
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("chat-busy")).toBeVisible();
  await expect(page.getByTestId("quiz-menu")).toHaveCount(0);
  await expect(page.getByTestId("quiz-start")).toHaveCount(0);
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await page.clock.fastForward(800);
  await expect(page.getByTestId("chat-busy")).toHaveCount(0);
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await expect(page.getByTestId("cap-hard").first()).toBeVisible();
  await expect(page.getByTestId("chat-offer")).toBeVisible();
  await expect(page.getByTestId("quiz-menu")).toHaveCount(0);
  await expect(page.locator('[data-testid="chat-msg"][data-from="user"]').filter({ hasText: capLine })).toHaveCount(1);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D7 SOS during the quiz opens the crisis screen and I'm safe returns to chat", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});
