import { test, expect } from "@playwright/test";
import { open, shot, assertNoStorage, assertNetwork, startAs, describe, crisisCallHrefs, crisisBannerHrefs, STRIP_HREFS } from "./helpers";

const order = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid^="service-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));

test("S4 consent / relationship pressure at 20:00 BKK → Teen Club first, 1323 and 1300 as backups, no crisis screen", async ({ page }) => {
  const rec = await open(page, "20:00");
  await startAs(page, "15-17");
  await describe(page, "แฟนกดดันให้มีเซ็กส์ แต่หนูยังไม่พร้อม จะปฏิเสธยังไงดี");
  await shot(page, "s4-01-describe");
  await page.getByTestId("need-submit").click();

  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(page.getByTestId("crisis-banner")).toHaveCount(0);
  await expect(page.getByTestId("intent-label")).toHaveAttribute("data-intent", "relationship_consent");
  expect(await order(page)).toEqual(["service-teen_club", "service-hotline_1323", "service-hotline_1300"]);
  await expect(page.getByTestId("status-teen_club")).toHaveAttribute("data-state", "open");
  await shot(page, "s4-02-suggestions-2000");

  await page.getByTestId("pick-teen_club").click();
  const box = page.getByTestId("summary-input");
  await expect(box).toHaveValue(/ยังไม่พร้อม/);
  await shot(page, "s4-03-summary");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("demo-banner")).toContainText("DEMO");
  await shot(page, "s4-04-handoff-demo");

  await assertNoStorage(page);
  await assertNetwork(page, rec);
  expect(rec.consoleText.join("\n")).not.toContain("กดดัน");
});

test("C2 being forced (consent → crisis override) → crisis screen with 191 then 1300", async ({ page }) => {
  const rec = await open(page, "20:00");
  await startAs(page, "15-17");
  await describe(page, "เมื่อวานถูกบังคับให้มีเซ็กส์ ตอนนี้กลัวมาก");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  expect(await crisisCallHrefs(page)).toEqual(["tel:191", "tel:1300"]);
  await expect(page.getByTestId("crisis-female-officer")).toHaveCount(0);
  await expect(page.getByTestId("screen-crisis")).not.toContainText("พนักงานสอบสวนหญิง");
  await shot(page, "c2-01-forced-crisis-1300-first");
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("S5 mental health (non-crisis) at 23:30 BKK → 1323 first, no crisis screen", async ({ page }) => {
  const rec = await open(page, "23:30");
  await startAs(page, "18+");
  await describe(page, "ช่วงนี้เครียดมาก นอนไม่หลับ ร้องไห้ทุกคืน ไม่กล้าบอกที่บ้าน");
  await page.getByTestId("need-submit").click();

  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  await expect(page.getByTestId("crisis-banner")).toHaveCount(0);
  await expect(page.getByTestId("intent-label")).toHaveAttribute("data-intent", "mental_health");
  const o = await order(page);
  expect(o[0]).toBe("service-hotline_1323");
  await expect(page.getByTestId("status-hotline_1323")).toHaveAttribute("data-state", "open");
  await shot(page, "s5-01-suggestions-2330");

  await page.getByTestId("pick-hotline_1323").click();
  await expect(page.getByTestId("summary-input")).toHaveValue(/ถึงเจ้าหน้าที่ สายด่วนสุขภาพจิต 1323/);
  await shot(page, "s5-02-summary");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await shot(page, "s5-03-handoff-demo");

  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("C3 mental health + suicidal phrase → crisis override, 1323 first", async ({ page }) => {
  const rec = await open(page, "23:30");
  await startAs(page, "18+");
  await describe(page, "ช่วงนี้เครียดมาก นอนไม่หลับ ไม่อยากมีชีวิตอยู่แล้ว");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  expect(await crisisCallHrefs(page)).toEqual(["tel:1323", "tel:1669"]);
  await expect(page.getByTestId("crisis-female-officer")).toHaveCount(0);
  await shot(page, "c3-01-mental-to-crisis");
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("V1 violence (non-crisis) → OSCC card is in-person only: label shown, no prepare-message, no ออนไลน์ draft", async ({ page }) => {
  const rec = await open(page, "10:00");
  await startAs(page, "18+");
  // Synthetic: blackmail without a photo/clip (แบล็กเมล์ + รูป/คลิป is an extra image-threat crisis).
  await describe(page, "โดนแบล็กเมล์ ไม่รู้จะทำยังไง");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  const oscc = page.getByTestId("service-oscc_hospital");
  await expect(oscc).toBeVisible();
  await expect(oscc).toContainText("ติดต่อศูนย์พึ่งได้ที่โรงพยาบาลรัฐใกล้บ้าน");
  await expect(page.getByTestId("pick-oscc_hospital")).toHaveCount(0);
  await expect(page.getByTestId("pick-hotline_1300")).toBeVisible();
  await page.getByTestId("pick-hotline_1300").click();
  await expect(page.getByTestId("summary-input")).toBeVisible();
  const draft = await page.getByTestId("summary-input").inputValue();
  expect(draft).not.toContain("ออนไลน์");
  await page.getByTestId("cancel").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("summary-input")).toHaveCount(0);
  await shot(page, "v1-oscc-in-person-no-draft");
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("extra image-threat pattern from describe opens the crisis screen (191 then 1300)", async ({ page }) => {
  const rec = await open(page, "10:00");
  await startAs(page, "18+");
  await describe(page, "แฟนเก่าขู่ปล่อยคลิป ไม่รู้จะทำยังไง");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  expect(await crisisCallHrefs(page)).toEqual(["tel:191", "tel:1300"]);
  await expect(page.getByTestId("screen-crisis").locator("img")).toHaveCount(0);
  await expect(page.getByTestId("screen-crisis").locator("svg")).toHaveCount(0);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("B2 mild medical 'เลือดออกมากนิดหน่อย' → strip shows all four in pinned order, not the crisis screen", async ({ page }) => {
  const rec = await open(page, "14:00");
  await startAs(page, "18+");
  await describe(page, "เลือดออกมากนิดหน่อย");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  const strip = page.getByTestId("crisis-banner");
  await expect(strip).toBeVisible();
  expect(await crisisBannerHrefs(page)).toEqual([...STRIP_HREFS.medical_emergency]);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("B1 benign mention of a crisis word (TV drama) → normal flow continues with a crisis strip, not the override", async ({ page }) => {
  const rec = await open(page, "20:00");
  await startAs(page, "15-17");
  await describe(page, "ซีรีส์เรื่องนี้มีฉากข่มขืน ดูแล้วไม่สบายใจ อยากคุยกับใครสักคน");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("screen-crisis")).toHaveCount(0);
  const strip = page.getByTestId("crisis-banner");
  await expect(strip).toBeVisible();
  expect(await crisisBannerHrefs(page)).toEqual([...STRIP_HREFS.sexual_violence]);
  await shot(page, "b1-01-banner-not-override");
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});
