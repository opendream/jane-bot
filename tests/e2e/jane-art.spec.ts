import { test, expect, type Page } from "@playwright/test";
import { open, viewportShot, assertHeaderDoesNotOverlap, assertNoStorage, assertNetwork, startAs } from "./helpers";

const ART_CREDIT = "Illustration © Opendream, 2018";
const CDN = /fonts\.googleapis|fonts\.gstatic|gstatic\.com|googleapis\.com|cdnjs|jsdelivr|unpkg|cloudinary|imgur|fbcdn|raw\.githubusercontent|github\.com/i;

async function openChat(page: Page, band = "15-17") {
  await startAs(page, band);
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
}

async function assertStarAlts(page: Page) {
  const imgs = await page.locator("img").evaluateAll((els) =>
    els.map((e) => ({
      alt: e.getAttribute("alt"),
      hidden: e.getAttribute("aria-hidden"),
      testid: e.getAttribute("data-testid"),
      src: e.getAttribute("src") ?? "",
    })));
  for (const img of imgs) {
    expect(img.src, img.testid ?? "img").not.toMatch(/\.webp(\?|$)/i);
    expect(img.alt, img.testid ?? "img").not.toBeNull();
    if (img.hidden === "true" || img.testid === "jane-star") expect(img.alt).toBe("");
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

test("welcome screen shows vector stars, credit, and no raster Jane art", async ({ page }) => {
  const rec = await open(page, "14:00");
  await expect(page.getByTestId("screen-start")).toBeVisible();
  await expect(page.getByTestId("art-credit")).toHaveText(ART_CREDIT);
  await expect(page.getByTestId("jane-header")).toHaveCount(0);
  await expect(page.getByTestId("welcome-stars").locator('[data-testid="jane-star"]')).toHaveCount(3);
  await assertStarAlts(page);
  await viewportShot(page, "v12-01-welcome", page.getByTestId("screen-start"));
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  await assertLocalOnly(rec);
});

test("chat has no empty-state raster and no avatar; bubbles still work", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page);
  await expect(page.getByTestId("chat-empty")).toHaveCount(0);
  await expect(page.getByTestId("jane-empty")).toHaveCount(0);
  await expect(page.getByTestId("jane-avatar")).toHaveCount(0);
  await expect(page.getByTestId("art-credit")).toHaveText(ART_CREDIT);
  await assertStarAlts(page);
  await viewportShot(page, "v12-02-chat", page.getByTestId("chat-log"));
  await page.getByTestId("chat-chip-1").click();
  await expect(page.locator('[data-testid="chat-msg"][data-from="jane"]').last()).toHaveAttribute("data-card", "pregnancy.p000");
  await expect(page.getByTestId("jane-avatar")).toHaveCount(0);
  await viewportShot(page, "v12-03-chat-followup", page.locator('[data-testid="chat-msg"][data-from="jane"]').last());
  await assertNoStorage(page);
  await assertNetwork(page, rec);
  await assertLocalOnly(rec);
});

test("quiz question has no thinking raster; success shows stars only", async ({ page }) => {
  const rec = await open(page, "14:00");
  await openChat(page);
  await page.getByTestId("quiz-menu").click();
  await expect(page.getByTestId("quiz-panel")).toBeVisible();
  await expect(page.getByTestId("quiz-thinking")).toHaveCount(0);
  await expect(page.getByTestId("jane-quiz-thinking")).toHaveCount(0);
  await expect(page.getByTestId("quiz-success")).toHaveCount(0);
  await viewportShot(page, "v12-04-quiz-question", page.getByTestId("quiz-panel"));
  await page.getByTestId("quiz-opt-1").click();
  await expect(page.getByTestId("quiz-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("quiz-success")).toBeVisible();
  await expect(page.getByTestId("jane-quiz-surprised")).toHaveCount(0);
  await expect(page.getByTestId("quiz-stars").locator('[data-testid="jane-star"]')).toHaveCount(4);
  await assertHeaderDoesNotOverlap(page, "quiz-stars");
  await viewportShot(page, "v12-05-quiz-success", page.getByTestId("quiz-success"));
  await assertStarAlts(page);
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
