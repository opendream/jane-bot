import { test, expect } from "@playwright/test";
import { open, startAs, describe, assertNoStorage, assertNetwork, crisisCallHrefs } from "./helpers";

/** Owner ruling 23 Oct 2026: each crisis screen lists only the helplines that fit it. Synthetic texts only. */
const SCREENS: { name: string; text: string; hrefs: string[] }[] = [
  { name: "self-harm / suicide", text: "ไม่อยากมีชีวิตอยู่แล้ว", hrefs: ["tel:1323", "tel:1669"] },
  { name: "sexual violence", text: "หนูถูกข่มขืน", hrefs: ["tel:191", "tel:1300"] },
  { name: "family violence / abuse", text: "พ่อเลี้ยงทุบตีทุกวัน", hrefs: ["tel:1300", "tel:191"] },
  { name: "medical emergency", text: "เลือดออกเยอะมาก หลังกินยา", hrefs: ["tel:1669"] },
  { name: "mixed / multiple categories", text: "ไม่อยากมีชีวิตอยู่แล้ว หนูถูกข่มขืน", hrefs: ["tel:1323", "tel:1300", "tel:1669", "tel:191"] },
];

for (const s of SCREENS) {
  test(`crisis screen ${s.name} shows ${s.hrefs.join(", ")}`, async ({ page }) => {
    const rec = await open(page, "14:00");
    await startAs(page, "15-17");
    await describe(page, s.text);
    await page.getByTestId("need-submit").click();
    await expect(page.getByTestId("screen-crisis")).toBeVisible();
    expect(await crisisCallHrefs(page)).toEqual(s.hrefs);
    await expect(page.getByTestId("crisis-female-officer")).toHaveCount(0);
    await expect(page.getByTestId("screen-crisis")).not.toContainText("พนักงานสอบสวนหญิง");
    await assertNoStorage(page);
    await assertNetwork(page, rec);
  });
}
