/**
 * Production dist/ must not contain the dev-test switcher, turn log, or arm loader.
 * SYNTHETIC URL only; no user content.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const MARKERS = [
  "__JANE_DEVTEST__",
  'data-testid="dev-arm"',
  "devtest/arms.json",
  "jane.devtest.log",
  "jane.devtest.arm",
  "?arm=",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test("production dist contains no switcher, log, or arm markers and no src/dev chunk", () => {
  expect(fs.existsSync("dist/index.html"), "run npm run build first").toBe(true);
  const files = walk("dist");
  const textFiles = files.filter((f) => /\.(js|css|html|json|txt|map)$/.test(f));
  for (const f of textFiles) {
    const text = fs.readFileSync(f, "utf8");
    for (const m of MARKERS) {
      expect(text.includes(m), `${f} contains ${JSON.stringify(m)}`).toBe(false);
    }
  }
  const assets = fs.existsSync("dist/assets") ? fs.readdirSync("dist/assets") : [];
  expect(assets.some((n) => /devtest|dev-arm|turn-log/.test(n)), String(assets)).toBe(false);
});

test("/?arm=A-tuned on the production build shows no DEV badge", async ({ page }) => {
  await page.goto("/?arm=A-tuned");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("dev-arm")).toHaveCount(0);
  await expect(page.getByTestId("dev-arm-panel")).toHaveCount(0);
  await expect(page.getByTestId("model-status")).toBeVisible();
});
