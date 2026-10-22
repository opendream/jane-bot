import { test, expect } from "@playwright/test";
import { open, shot, assertNoStorage, assertNetwork, startAs, describe } from "./helpers";

test("S1 pregnancy worry at 19:00 BKK → 1663 (open) → edit → approve → DEMO handoff", async ({ page }) => {
  const rec = await open(page, "19:00");
  await shot(page, "s1-01-start");
  await startAs(page, "15-17");
  await describe(page, "ประจำเดือนมาช้าไปสองอาทิตย์ กลัวท้อง ไม่กล้าบอกใคร");
  await shot(page, "s1-02-describe");
  await page.getByTestId("need-submit").click();

  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await expect(page.getByTestId("intent-label")).toHaveAttribute("data-intent", "pregnancy");
  const cards = page.locator('[data-testid^="service-"]');
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  expect(await cards.count()).toBeLessThanOrEqual(3);
  await expect(cards.first()).toHaveAttribute("data-testid", "service-hotline_1663");
  await expect(page.getByTestId("status-hotline_1663")).toHaveAttribute("data-state", "open");
  await expect(page.getByTestId("status-teen_club")).toHaveAttribute("data-state", "open");
  await expect(page.locator('a[href="tel:1663"]').first()).toBeVisible();
  await shot(page, "s1-03-suggestions");

  await page.getByTestId("pick-hotline_1663").click();
  await expect(page.getByTestId("screen-summary")).toBeVisible();
  const box = page.getByTestId("summary-input");
  await expect(box).toHaveValue(/ถึงเจ้าหน้าที่ สายด่วน 1663/);
  await expect(box).toHaveValue(/ช่วงอายุ: 15–17 ปี/);
  await shot(page, "s1-04-summary-draft");
  // She edits one line.
  const v = await box.inputValue();
  await box.fill(v.replace(/- สิ่งที่อยากได้: .*/, "- สิ่งที่อยากได้: อยากคุยกับเจ้าหน้าที่ผู้หญิงวันนี้"));
  await shot(page, "s1-05-summary-edited");
  await page.getByTestId("approve").click();

  await expect(page.getByTestId("screen-handoff")).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toContainText("DEMO — ยังไม่ได้ส่งอะไรเลย");
  await expect(page.getByTestId("demo-banner")).toContainText("nothing was sent");
  await expect(page.getByTestId("handoff-text")).toContainText("อยากคุยกับเจ้าหน้าที่ผู้หญิงวันนี้");
  await expect(page.getByTestId("not-medical-advice")).toBeVisible();
  await shot(page, "s1-06-handoff-demo");

  await assertNoStorage(page);
  await assertNetwork(page, rec);
  expect(rec.consoleText.join("\n")).not.toContain("กลัวท้อง");

  await page.getByTestId("erase-restart").click();
  await expect(page.getByTestId("screen-start")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("กลัวท้อง");
});

test("S2 condom broke at 08:30 BKK, with name + phone typed → PII stripped, open-now ordering", async ({ page }) => {
  const rec = await open(page, "08:30");
  await startAs(page, "18-24");
  await describe(page, "เมื่อคืนถุงยางแตก หนูชื่อมายด์ เบอร์ 0891234567 ควรทำยังไงดี");
  await shot(page, "s2-01-describe");
  await page.getByTestId("need-submit").click();

  await expect(page.getByTestId("intent-label")).toHaveAttribute("data-intent", "emergency_contraception");
  // 08:30: 1663 (09:00) and Teen Club (17:00) closed; closed services show when they open.
  await expect(page.getByTestId("status-hotline_1663")).toHaveAttribute("data-state", "closed");
  await expect(page.getByTestId("status-hotline_1663")).toContainText("09:00");
  await shot(page, "s2-02-suggestions-0830");

  await page.getByTestId("pick-hotline_1663").click();
  const val = await page.getByTestId("summary-input").inputValue();
  expect(val).not.toContain("มายด์");
  expect(val).not.toContain("0891234567");
  expect(val).toContain("ถุงยางแตก");
  expect(val).toContain("ยาคุมฉุกเฉิน");
  await shot(page, "s2-03-summary-pii-stripped");
  // She adds her LINE id in the editor; it is stripped on approval.
  await page.getByTestId("summary-input").fill(val + "\nไลน์ myd_2008");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("handoff-text")).not.toContainText("myd_2008");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await shot(page, "s2-04-handoff-demo");

  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("S3 HIV test at 14:00 BKK → cancel, re-pick, approve", async ({ page }) => {
  const rec = await open(page, "14:00");
  await startAs(page, "unspecified");
  await describe(page, "อยากไปตรวจเอชไอวี แต่ไม่อยากให้ที่บ้านรู้");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("intent-label")).toHaveAttribute("data-intent", "sti_hiv");
  await expect(page.getByTestId("service-hotline_1663")).toBeVisible();
  await expect(page.getByTestId("service-yfhs")).toBeVisible();
  await expect(page.getByTestId("status-yfhs")).toHaveAttribute("data-state", "unknown");
  await shot(page, "s3-01-suggestions");

  await page.getByTestId("pick-hotline_1663").click();
  await shot(page, "s3-02-summary");
  await page.getByTestId("cancel").click();
  await expect(page.getByTestId("screen-suggest")).toBeVisible();
  await page.getByTestId("pick-hotline_1663").click();
  await expect(page.getByTestId("summary-input")).toHaveValue(/ช่วงอายุ: ไม่ระบุ/);
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await shot(page, "s3-03-handoff-demo");

  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("C1 crisis phrase overrides the flow → 1323 first, 1300/1669/191 tap-to-call; quick exit wipes", async ({ page }) => {
  const rec = await open(page, "02:00");
  await startAs(page, "15-17");
  await describe(page, "ช่วงนี้ไม่อยากมีชีวิตอยู่แล้ว ท้องด้วย");
  await page.getByTestId("need-submit").click();

  const t0 = Date.now();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(1000);
  await expect(page.getByTestId("screen-suggest")).toHaveCount(0);
  const order = await page.locator('[data-testid^="crisis-"] a').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(order[0]).toBe("tel:1323");
  expect(new Set(order)).toEqual(new Set(["tel:1323", "tel:1300", "tel:1669", "tel:191"]));
  await shot(page, "c1-01-crisis-card");

  // SOS button also reachable from any screen
  await page.getByTestId("crisis-continue").click();
  await expect(page.getByTestId("screen-describe")).toBeVisible();
  await expect(page.getByTestId("need-input")).toHaveValue("");
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();

  await page.getByTestId("quick-exit").click();
  await expect(page.getByTestId("screen-neutral")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("ไม่อยากมีชีวิต");
  await shot(page, "c1-02-quick-exit-neutral");

  await assertNoStorage(page);
  await assertNetwork(page, rec);
});

test("Under-age path and static guarantees (no image upload, no external links)", async ({ page }) => {
  const rec = await open(page, "12:00");
  await page.getByTestId("age-under").click();
  await expect(page.getByTestId("screen-underage")).toContainText("15 ปีขึ้นไป");
  await shot(page, "u1-underage");
  expect(await page.locator('input[type="file"]').count()).toBe(0);
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  for (const h of hrefs) expect(h.startsWith("tel:"), h).toBe(true);
  await assertNetwork(page, rec);
});

test("Canary: the network recorder does catch a request made after load", async ({ page }) => {
  const rec = await open(page, "12:00");
  await page.evaluate(() => fetch("/canary-should-404").catch(() => null));
  await page.waitForTimeout(200);
  expect(rec.flowRequests().some((u) => u.includes("canary-should-404"))).toBe(true);
});
