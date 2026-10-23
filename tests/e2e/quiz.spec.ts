import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { open, shot, assertNoStorage, assertNetwork, startAs } from "./helpers";

const QUIZ = JSON.parse(fs.readFileSync("src/data/bank/quiz.json", "utf8")) as { items: { id: string; prompt_th: string; explanation_th: string }[] };
const QUIZ_WRAP = "ขอบคุณที่ลองทำควิซนะ กลับไปคุยกับพี่เจนต่อได้เลย";
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
  await expect(page.getByTestId("quiz-result")).toHaveText("ถูก");
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
  await expect(page.getByTestId("quiz-result")).toHaveText("ถูก");
  await expect(page.getByTestId("quiz-explain")).toContainText("ปรึกษาฟรี ทุกวัน 09:00–21:00 น. รวมวันหยุด");
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
  await expect(page.getByTestId("quiz-result")).toHaveText("ถูก");
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

test("D7 crisis phrase mid-quiz opens the crisis screen", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page, "15-17");
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await say(page, "ไม่อยากมีชีวิตอยู่แล้ว");
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await expect(page.getByTestId("quiz-panel")).toHaveCount(0);
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});
