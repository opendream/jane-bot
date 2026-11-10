/**
 * Dev arm / model badge: visible only with ?modelPick=1, never on the filming
 * URL, and never overlapping the send button on a phone viewport.
 * SYNTHETIC only.
 */
import { test, expect, type Page } from "@playwright/test";
import { startAs, rectsOverlap } from "./helpers";

test.use({ viewport: { width: 412, height: 915 } });

async function openChat(page: Page, band = "18-24") {
  await startAs(page, band);
  await page.getByTestId("open-chat").click();
  await expect(page.getByTestId("screen-chat")).toBeVisible();
}

test("filming default chat-first without modelPick hides the model badge", async ({ page }) => {
  await page.goto("/?testRuntime=chat-ok&runtime=wasm");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await expect(page.getByTestId("model-status")).toBeHidden();
  await openChat(page);
  await expect(page.getByTestId("model-status")).toBeHidden();
  await expect(page.getByTestId("chat-send")).toBeVisible();
  await expect(page.getByTestId("engine-label")).toHaveCount(0);
});

test("modelPick badge at 412x915 never overlaps the send button", async ({ page }) => {
  await page.goto("/?modelPick=1&chatFirst=0&testRuntime=pick-ok&runtime=wasm");
  await page.waitForLoadState("domcontentloaded");
  const badge = page.getByTestId("model-status");
  await expect(badge).toHaveAttribute("data-state", "ready", { timeout: 10_000 });
  await expect(badge).toBeVisible();
  await openChat(page);
  await expect(badge).toBeVisible();
  const send = page.getByTestId("chat-send");
  await expect(send).toBeVisible();
  const badgeBox = await badge.boundingBox();
  const sendBox = await send.boundingBox();
  expect(badgeBox, "visible model badge").toBeTruthy();
  expect(sendBox, "send button").toBeTruthy();
  expect(rectsOverlap(badgeBox!, sendBox!), "model badge overlaps ส่ง").toBe(false);
});
