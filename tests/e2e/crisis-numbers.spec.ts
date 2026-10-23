import { test, expect } from "@playwright/test";
import { open, startAs, describe, assertNoStorage, assertNetwork, crisisCallHrefs } from "./helpers";

/** Owner ruling 23 Oct 2026: each crisis screen lists only the helplines that fit it. Synthetic texts only. */
const SCREENS: { name: string; text: string; hrefs: string[]; officer: boolean }[] = [
  { name: "self-harm / suicide", text: "ไม่อยากมีชีวิตอยู่แล้ว", hrefs: ["tel:1323", "tel:1669"], officer: false },
  { name: "sexual violence", text: "หนูถูกข่มขืน", hrefs: ["tel:191", "tel:1300"], officer: true },
  { name: "family violence / abuse", text: "พ่อเลี้ยงทุบตีทุกวัน", hrefs: ["tel:1300", "tel:191"], officer: false },
  { name: "medical emergency", text: "เลือดออกเยอะมาก หลังกินยา", hrefs: ["tel:1669"], officer: false },
  { name: "mixed / multiple categories", text: "ไม่อยากมีชีวิตอยู่แล้ว หนูถูกข่มขืน", hrefs: ["tel:1323", "tel:1300", "tel:1669", "tel:191"], officer: false },
];

for (const s of SCREENS) {
  test(`crisis screen ${s.name} shows ${s.hrefs.join(", ")}`, async ({ page }) => {
    const rec = await open(page, "14:00");
    await startAs(page, "15-17");
    await describe(page, s.text);
    await page.getByTestId("need-submit").click();
    await expect(page.getByTestId("screen-crisis")).toBeVisible();
    expect(await crisisCallHrefs(page)).toEqual(s.hrefs);
    const officer = page.getByTestId("crisis-female-officer");
    await expect(officer).toHaveCount(s.officer ? 1 : 0);
    if (s.officer) await expect(officer).toContainText("ขอให้พนักงานสอบสวนหญิงเป็นผู้สอบปากคำได้");
    await assertNoStorage(page);
    await assertNetwork(page, rec);
  });
}
