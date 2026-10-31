import { test, expect } from "@playwright/test";
import { open, startAs, assertNoStorage, assertNetwork, crisisCallHrefs } from "./helpers";
import { AGE_REDIRECT_TEXT } from "../../src/core/age";

const ADULT_Q = "เนื้อหาทดสอบสิบแปดบวก"; // SYNTHETIC trigger on the 18+ fixture card
const BANDS = ["15-17", "18-24", "25+", "unspecified"] as const;

test("D5 start screen: 15–17 / 18–24 / 25+ / ไม่อยากบอก; under-15 link unchanged", async ({ page }) => {
  const rec = await open(page, "14:00");
  await expect(page.getByTestId("age-question")).toHaveText("คุณอายุเท่าไร (เลือกช่วง ไม่อยากบอกก็ได้)");
  await expect(page.getByTestId("age-adult-note")).toHaveText("บางคำตอบมีไว้สำหรับอายุ 18 ปีขึ้นไปเท่านั้น");
  await expect(page.getByTestId("age-15-17")).toHaveText("15–17 ปี");
  await expect(page.getByTestId("age-18-24")).toHaveText("18–24 ปี");
  await expect(page.getByTestId("age-25+")).toHaveText("25 ปีขึ้นไป");
  await expect(page.getByTestId("age-unspecified")).toHaveText("ไม่อยากบอก");
  await expect(page.getByTestId("age-18+")).toHaveCount(0);
  await expect(page.getByTestId("age-under")).toBeVisible();
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D5 15–17 asks an 18+ question → redirect card, 1663 offer, no storage", async ({ page }) => {
  const rec = await open(page, "14:00", "&bank=fixture");
  await startAs(page, "15-17");
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await page.getByTestId("chat-input").fill(ADULT_Q);
  await page.getByTestId("chat-send").click();
  const jane = page.locator('[data-testid="chat-msg"][data-from="jane"]').last();
  await expect(jane).toHaveAttribute("data-card", "general.age_redirect.000");
  await expect(jane.getByTestId("chat-text")).toHaveText(AGE_REDIRECT_TEXT);
  await expect(jane.getByTestId("chat-offer")).toBeVisible();
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D5 18–24 and 25+ ask the same question → 18+ card", async ({ page }) => {
  for (const band of ["18-24", "25+"] as const) {
    const rec = await open(page, "14:00", "&bank=fixture");
    await startAs(page, band);
    await page.getByTestId("open-chat").click();
    await expect(page.getByTestId("screen-chat")).toBeVisible();
    await page.getByTestId("chat-input").fill(ADULT_Q);
    await page.getByTestId("chat-send").click();
    const jane = page.locator('[data-testid="chat-msg"][data-from="jane"]').last();
    await expect(jane).toHaveAttribute("data-card", "other.adult_only.000");
    await expect(jane.getByTestId("chat-text")).toContainText("18 ปีขึ้นไป");
    await assertNoStorage(page);
    await assertNetwork(page, rec);
  }
});

test("D5 crisis phrase → crisis screen for all four bands", async ({ page }) => {
  for (const band of BANDS) {
    const rec = await open(page, "14:00");
    await startAs(page, band);
    await page.getByTestId("need-input").fill("ไม่อยากมีชีวิตอยู่แล้ว");
    await page.getByTestId("need-submit").click();
    await expect(page.getByTestId("screen-crisis")).toBeVisible();
    expect(await crisisCallHrefs(page)).toEqual(["tel:1323", "tel:1669"]);
    await expect(page.getByTestId("screen-crisis")).toContainText("1663");
    await assertNoStorage(page);
    await assertNetwork(page, rec);
  }
});

test("D5 SOS is not age-gated: all four bands reach the crisis numbers", async ({ page }) => {
  for (const band of BANDS) {
    const rec = await open(page, "14:00");
    await startAs(page, band);
    await expect(page.getByTestId("sos")).toBeVisible();
    await page.getByTestId("sos").click();
    await expect(page.getByTestId("screen-crisis")).toBeVisible();
    expect(await crisisCallHrefs(page)).toEqual(["tel:1323", "tel:1300", "tel:1669", "tel:191"]);
    await expect(page.getByTestId("screen-crisis")).toContainText("1663");
    await assertNoStorage(page);
    await assertNetwork(page, rec);
  }
});

test("D5 under-15 screen still shows 1323/1300/1663 and SOS is not delayed by age", async ({ page }) => {
  const rec = await open(page, "14:00");
  await page.getByTestId("age-under").click();
  await expect(page.getByTestId("screen-underage")).toBeVisible();
  await expect(page.getByTestId("screen-underage").locator("h1")).toHaveText("ขอบคุณที่บอกเจน");
  await expect(page.getByTestId("screen-underage")).not.toContainText("ขอบคุณที่บอกพี่เจน");
  await expect(page.getByTestId("brand")).toContainText("เจน");
  await expect(page.getByTestId("brand")).not.toContainText("พี่เจน");
  await expect(page.locator('a[href="tel:1323"]').first()).toBeVisible();
  await expect(page.locator('a[href="tel:1300"]').first()).toBeVisible();
  await expect(page.locator('a[href="tel:1663"]').first()).toBeVisible();
  await expect(page.getByTestId("sos")).toBeVisible();
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  expect(await crisisCallHrefs(page)).toEqual(["tel:1323", "tel:1300", "tel:1669", "tel:191"]);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("D5 chat crisis for ไม่อยากบอก is not behind the age gate", async ({ page }) => {
  const rec = await open(page, "14:00");
  await startAs(page, "unspecified");
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
  await page.getByTestId("chat-input").fill("ไม่อยากมีชีวิตอยู่แล้ว");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  expect(await crisisCallHrefs(page)).toEqual(["tel:1323", "tel:1669"]);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});
