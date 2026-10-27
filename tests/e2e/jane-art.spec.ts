import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { open, viewportShot, assertHeaderDoesNotOverlap, assertNoStorage, assertNetwork, startAs } from "./helpers";

const ART_CREDIT = "Illustration © Opendream, 2018";
const CDN = /fonts\.googleapis|fonts\.gstatic|gstatic\.com|googleapis\.com|cdnjs|jsdelivr|unpkg|cloudinary|imgur|fbcdn|raw\.githubusercontent|github\.com/i;
const RASTER = /\.(webp|png|jpe?g|gif|avif|jxl|bmp)$/i;
const JANE_RASTER_ALLOWLIST = [
  "avatar.webp", "avatar-192.webp", "avatar-96.webp", "header.webp", "empty.webp",
  "quiz-thinking.webp", "quiz-surprised.webp", "quiz-back.webp",
] as const;
const ALLOWED = new Set<string>(JANE_RASTER_ALLOWLIST);

async function openChat(page: Page, band = "15-17") {
  await startAs(page, band);
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
}

async function assertJaneAlts(page: Page) {
  const imgs = await page.locator("img").evaluateAll((els) =>
    els.map((e) => ({
      alt: e.getAttribute("alt"),
      hidden: e.getAttribute("aria-hidden"),
      testid: e.getAttribute("data-testid"),
    })));
  expect(imgs.length, "Jane UI should render images").toBeGreaterThan(0);
  for (const img of imgs) {
    expect(img.alt, img.testid ?? "img").not.toBeNull();
    if (img.hidden === "true" || img.testid === "jane-star") expect(img.alt).toBe("");
    else expect(img.alt!.length, img.testid ?? "img").toBeGreaterThan(0);
  }
}

async function assertLocalOnly(rec: Awaited<ReturnType<typeof open>>) {
  await expect.poll(() => rec.all.length).toBeGreaterThan(0);
  for (const u of rec.all) {
    expect(u.startsWith("http://127.0.0.1:4173"), `only local origin: ${u}`).toBe(true);
    expect(u, `no external font/image host: ${u}`).not.toMatch(CDN);
  }
  expect(rec.flowRequests()).toEqual([]);
}

function allowlistedRaster(file: string): string | null {
  if (ALLOWED.has(file)) return file;
  const ordered = [...ALLOWED].sort((a, b) => b.replace(/\.[^.]+$/, "").length - a.replace(/\.[^.]+$/, "").length);
  for (const a of ordered) {
    const stem = a.replace(/\.[^.]+$/, "");
    const ext = a.slice(stem.length);
    if (new RegExp(`^${stem}-[A-Za-z0-9_-]+\\${ext.replace(".", "\\.")}$`).test(file)) return a;
  }
  return null;
}

test("dist ships only the allowlisted Jane rasters", () => {
  const dist = path.resolve("dist");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (RASTER.test(ent.name)) found.push(p);
    }
  };
  walk(dist);
  const mapped = found.map((p) => {
    const allowed = allowlistedRaster(path.basename(p));
    expect(allowed, `unexpected raster in dist: ${path.relative(dist, p)}`).not.toBeNull();
    return allowed!;
  });
  expect([...new Set(mapped)].sort()).toEqual([...ALLOWED].sort());
});

test("welcome screen shows header art, credit, Thai alt, and no CDN", async ({ page }) => {
  const rec = await open(page, "14:00");
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await expect(page.getByTestId("art-credit")).toHaveText(ART_CREDIT);
  await expect(page.getByTestId("jane-header")).toBeVisible();
  await expect(page.getByTestId("jane-header")).toHaveAttribute("alt", /[ก-๙]/);
  await expect(page.getByTestId("welcome-stars").locator('[data-testid="jane-star"]')).toHaveCount(3);
  await assertJaneAlts(page);
  await viewportShot(page, "v12-01-welcome", page.getByTestId("jane-header"));
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  await assertLocalOnly(rec);
});

test("empty chat shows empty.webp on a white card; bot bubbles use the avatar srcset", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page);
  const empty = page.getByTestId("chat-empty");
  await expect(empty).toBeVisible();
  await expect(page.getByTestId("jane-empty")).toHaveAttribute("alt", /[ก-๙]/);
  const bg = await empty.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/rgb\(255,\s*255,\s*255\)/);
  const avatar = page.getByTestId("jane-avatar").first();
  await expect(avatar).toBeVisible();
  await expect(avatar).toHaveAttribute("alt", /[ก-๙]/);
  const srcset = await avatar.getAttribute("srcset");
  expect(srcset).toMatch(/96w/);
  expect(srcset).toMatch(/192w/);
  expect(srcset).toMatch(/256w/);
  await expect(page.getByTestId("art-credit")).toHaveText(ART_CREDIT);
  await assertJaneAlts(page);
  await viewportShot(page, "v12-02-empty", page.getByTestId("chat-empty"));
  await page.getByTestId("chat-chip-1").click();
  await expect(page.locator('[data-testid="chat-msg"][data-from="jane"]').last()).toHaveAttribute("data-card", "pregnancy.p000");
  await expect(page.getByTestId("chat-empty")).toHaveCount(0);
  await expect(page.getByTestId("jane-avatar")).toHaveCount(2);
  await viewportShot(page, "v12-03-chat-avatar", page.locator('[data-testid="chat-msg"][data-from="jane"]').last());
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  await assertLocalOnly(rec);
});

test("quiz question shows thinking; success shows surprised plus stars", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page);
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await expect(page.getByTestId("quiz-thinking")).toBeVisible();
  await expect(page.getByTestId("jane-quiz-thinking")).toHaveAttribute("alt", /[ก-๙]/);
  await expect(page.getByTestId("quiz-success")).toHaveCount(0);
  await viewportShot(page, "v12-04-quiz-thinking", page.getByTestId("quiz-thinking"));
  await page.getByTestId("quiz-opt-1").click();
  await expect(page.getByTestId("quiz-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("quiz-success")).toBeVisible();
  await expect(page.getByTestId("jane-quiz-surprised")).toBeVisible();
  await expect(page.getByTestId("quiz-stars").locator('[data-testid="jane-star"]')).toHaveCount(4);
  await assertHeaderDoesNotOverlap(page, "jane-quiz-surprised");
  await assertHeaderDoesNotOverlap(page, "quiz-stars");
  await viewportShot(page, "v12-05-quiz-success", page.getByTestId("quiz-success"));
  await assertJaneAlts(page);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  await assertLocalOnly(rec);
});

test("quiz wrong answer shows the back figure", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page);
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await page.getByTestId("quiz-opt-0").click();
  await expect(page.getByTestId("quiz-result")).toHaveAttribute("data-ok", "false");
  await expect(page.getByTestId("quiz-try-again")).toBeVisible();
  await expect(page.getByTestId("jane-quiz-back")).toHaveAttribute("alt", /[ก-๙]/);
  await expect(page.getByTestId("quiz-success")).toHaveCount(0);
  await viewportShot(page, "v12-05b-quiz-wrong", page.getByTestId("quiz-try-again"));
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  await assertLocalOnly(rec);
});

test("crisis screen has zero img and zero svg; credit remains outside it", async ({ page }) => {
  const rec = await open(page, "14:00");
  await startAs(page, "15-17");
  await page.getByTestId("need-input").fill("ไม่อยากมีชีวิตอยู่แล้ว");
  await page.getByTestId("need-submit").click();
  const crisis = page.getByTestId("screen-crisis");
  await expect(crisis).toBeVisible();
  await expect(crisis.locator("h1")).toBeVisible();
  const color = await crisis.locator("h1").evaluate((el) => getComputedStyle(el).color);
  expect(color).toMatch(/rgb\(179,\s*38,\s*30\)/);
  await expect(page.getByTestId("crisis-1323")).toBeVisible();
  await expect(crisis.locator("img")).toHaveCount(0);
  await expect(crisis.locator("svg")).toHaveCount(0);
  await expect(page.getByTestId("art-credit")).toHaveText(ART_CREDIT);
  await expect(page.getByTestId("jane-header")).toHaveCount(0);
  await expect(page.getByTestId("jane-star")).toHaveCount(0);
  await viewportShot(page, "v12-06-crisis", crisis);
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  await assertLocalOnly(rec);
});
