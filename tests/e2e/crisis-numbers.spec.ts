import { test, expect } from "@playwright/test";
import { open, startAs, describe, assertNoStorage, assertNetwork, crisisCallHrefs } from "./helpers";

/** Owner ruling 23 Oct 2026 / 27 Oct 2026: helplines that fit the screen; call-now matches buttons. Synthetic texts only. */
const SCREENS: { name: string; text: string; hrefs: string[]; callNow: string }[] = [
  { name: "self-harm / suicide", text: "ไม่อยากมีชีวิตอยู่แล้ว", hrefs: ["tel:1323", "tel:1669"], callNow: "โทร 1323 หรือ 1669 ทันที" },
  { name: "sexual violence", text: "หนูถูกข่มขืน", hrefs: ["tel:191", "tel:1300"], callNow: "โทร 191 หรือ 1300 ทันที" },
  { name: "family violence / abuse", text: "พ่อเลี้ยงทุบตีทุกวัน", hrefs: ["tel:1300", "tel:191"], callNow: "โทร 1300 หรือ 191 ทันที" },
  { name: "medical emergency", text: "เลือดออกเยอะมาก หลังกินยา", hrefs: ["tel:1669"], callNow: "โทร 1669 ทันที" },
  { name: "mixed / multiple categories", text: "ไม่อยากมีชีวิตอยู่แล้ว หนูถูกข่มขืน", hrefs: ["tel:1323", "tel:1300", "tel:1669", "tel:191"], callNow: "โทร 1323, 1300, 1669 หรือ 191 ทันที" },
];

async function assertCallNowMatchesButtons(page: import("@playwright/test").Page, callNow: string, hrefs: string[]) {
  const line = await page.getByTestId("crisis-call-now").innerText();
  expect(line).toBe(callNow);
  expect(await crisisCallHrefs(page)).toEqual(hrefs);
  expect([...line.matchAll(/\d{3,4}/g)].map((m) => `tel:${m[0]}`)).toEqual(hrefs);
}

for (const s of SCREENS) {
  test(`crisis screen ${s.name} shows ${s.hrefs.join(", ")}`, async ({ page }) => {
    const rec = await open(page, "14:00");
    await startAs(page, "15-17");
    await describe(page, s.text);
    await page.getByTestId("need-submit").click();
    await expect(page.getByTestId("screen-crisis")).toBeVisible();
    await assertCallNowMatchesButtons(page, s.callNow, s.hrefs);
    await expect(page.getByTestId("crisis-female-officer")).toHaveCount(0);
    await expect(page.getByTestId("screen-crisis")).not.toContainText("พนักงานสอบสวนหญิง");
    await assertNoStorage(page);
    await assertNetwork(page, rec);
  });
}

test("SOS (unclear) call-now lists all four in pinned default order, matching buttons", async ({ page }) => {
  const rec = await open(page, "14:00");
  await startAs(page, "15-17");
  await page.getByTestId("sos").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
  await assertCallNowMatchesButtons(page, "โทร 1323, 1300, 1669 หรือ 191 ทันที", ["tel:1323", "tel:1300", "tel:1669", "tel:191"]);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
});
