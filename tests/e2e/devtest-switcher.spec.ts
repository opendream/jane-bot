/**
 * Dev-test build: badge, arm list, one-tap switch, crisis still rules-only.
 * Served on 127.0.0.1:4274 from dist-devtest. Fake manifest, mock worker. SYNTHETIC text only.
 */
import { test, expect, type Page } from "@playwright/test";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { startAs } from "./helpers";

const PORT = 4274;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const MODELS = path.resolve("tmp/devtest-e2e-models");
const SHA = "a".repeat(64);

const MANIFEST = {
  generated: "2026-10-29T00:00:00.000Z",
  arms: [
    { id: "A-base", label: "A-base", files: ["devtest/A-base.gguf"], bytes: 1.1e9, sha256: SHA, phone_ready: true },
    { id: "A-tuned", label: "A-tuned", files: ["devtest/A-tuned.gguf"], bytes: 1.1e9, sha256: SHA, phone_ready: true },
    { id: "B-base", label: "B-base", files: ["devtest/B-base.gguf"], bytes: 1.2e9, sha256: SHA, phone_ready: true },
    { id: "B-tuned", label: "B-tuned", files: ["devtest/B-tuned.gguf"], bytes: 1.2e9, sha256: SHA, phone_ready: true },
    {
      id: "F-tuned",
      label: "F-tuned",
      files: ["devtest/F-tuned.gguf"],
      bytes: 5 * 1024 ** 3,
      sha256: SHA,
      phone_ready: false,
      not_ready_reason: "over 4 GiB, not phone-ready",
    },
  ],
};

let server: ChildProcess | undefined;

async function waitFor(url: string, ms = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server not up: ${url}`);
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async () => {
  if (!fs.existsSync("dist-devtest/index.html")) {
    execSync("npx vite build --mode devtest", { stdio: "inherit" });
  }
  fs.mkdirSync(path.join(MODELS, "devtest"), { recursive: true });
  fs.writeFileSync(path.join(MODELS, "devtest", "arms.json"), JSON.stringify(MANIFEST));
  server = spawn("node", ["scripts/serve.mjs", "--port", String(PORT), "--dist", "dist-devtest", "--models", MODELS], {
    stdio: "ignore",
  });
  await waitFor(`${ORIGIN}/`);
});

test.afterAll(() => {
  server?.kill();
});

async function openDev(page: Page, extra = "?arm=A-base&testRuntime=pick-ok") {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.goto(`${ORIGIN}/${extra}`);
  await page.waitForLoadState("domcontentloaded");
  return urls;
}

test("?arm=A-base shows the DEV badge with the arm id", async ({ page }) => {
  await openDev(page);
  const badge = page.getByTestId("dev-arm");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("A-base");
  await expect(badge).toHaveAttribute("data-arm", "A-base");
});

test("no ?arm= loads nothing and the badge says no arm", async ({ page }) => {
  await openDev(page, "");
  await expect(page.getByTestId("dev-arm")).toContainText("no arm");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-runtime", "rules");
});

test("one tap switches A-base → A-tuned and the badge updates after reload", async ({ page }) => {
  await openDev(page, "?arm=A-base&testRuntime=pick-ok");
  await page.getByTestId("dev-arm").click();
  await expect(page.getByTestId("dev-arm-panel")).toBeVisible();
  await expect(page.getByTestId("dev-arm-pick-A-tuned")).toBeVisible();
  await expect(page.getByTestId("dev-arm-pick-F-tuned")).toBeDisabled();
  await expect(page.getByTestId("dev-arm-pick-F-tuned")).toHaveAttribute("data-ready", "false");
  await page.getByTestId("dev-arm-pick-A-tuned").click();
  await page.waitForURL(/arm=A-tuned/);
  await expect(page.getByTestId("dev-arm")).toContainText("A-tuned");
});

test("panel lists every manifest arm", async ({ page }) => {
  await openDev(page, "?arm=B-base&testRuntime=pick-ok");
  await page.getByTestId("dev-arm").click();
  for (const id of ["A-base", "A-tuned", "B-base", "B-tuned", "F-tuned", "off"]) {
    await expect(page.getByTestId(`dev-arm-pick-${id}`)).toBeVisible();
  }
});

test("crisis prompt in arm mode shows the crisis screen (0 picker UI)", async ({ page }) => {
  await openDev(page, "?arm=A-base&testRuntime=pick-ok");
  await expect(page.getByTestId("dev-arm")).toBeVisible();
  await startAs(page, "15-17");
  await page.getByTestId("need-input").fill("ไม่อยากมีชีวิตอยู่แล้ว");
  await page.getByTestId("need-submit").click();
  await expect(page.getByTestId("screen-crisis")).toBeVisible();
});

const TRACE = JSON.stringify({
  enabled: true,
  includeTyped: true,
  rows: [{ time: "t", arm: "A-base", sha: "x", runtime: "wasm", coldLoadMs: 1, ms: 1, text: "secret-trace" }],
});

async function seedDevtestStorage(page: Page) {
  await page.evaluate(({ logKey, armKey, payload }) => {
    localStorage.setItem(logKey, payload);
    localStorage.setItem(armKey, "A-base");
  }, { logKey: "jane.devtest.log", armKey: "jane.devtest.arm", payload: TRACE });
}

async function storageKeys(page: Page) {
  return page.evaluate(() => ({
    log: localStorage.getItem("jane.devtest.log"),
    arm: localStorage.getItem("jane.devtest.arm"),
  }));
}

test("erase chat removes jane.devtest.log so a reload cannot restore rows", async ({ page }) => {
  await openDev(page);
  await expect(page.getByTestId("dev-arm")).toBeVisible();
  await startAs(page, "15-17");
  await seedDevtestStorage(page);
  expect((await storageKeys(page)).log).toBeTruthy();
  await page.getByTestId("erase").click();
  const after = await storageKeys(page);
  expect(after.log).toBeNull();
  expect(after.arm).toBe("A-base");
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  const reloaded = await storageKeys(page);
  expect(reloaded.log).toBeNull();
  expect(reloaded.arm).toBe("A-base");
});

test("quick exit removes jane.devtest.log so a reload cannot restore rows", async ({ page }) => {
  await openDev(page);
  await expect(page.getByTestId("dev-arm")).toBeVisible();
  await seedDevtestStorage(page);
  expect((await storageKeys(page)).log).toBeTruthy();
  await page.getByTestId("quick-exit").click();
  const after = await storageKeys(page);
  expect(after.log).toBeNull();
  expect(after.arm).toBe("A-base");
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  const reloaded = await storageKeys(page);
  expect(reloaded.log).toBeNull();
  expect(reloaded.arm).toBe("A-base");
});

test("with the log on, export makes no request off 127.0.0.1", async ({ page }) => {
  const urls = await openDev(page, "?arm=A-base&testRuntime=pick-ok");
  await page.getByTestId("dev-arm").click();
  await page.getByTestId("dev-log-on").check();
  await expect(page.getByTestId("dev-log-banner")).toBeVisible();
  const exportBtn = page.getByTestId("dev-log-export");
  if (await exportBtn.isEnabled()) {
    page.once("download", () => {});
    await exportBtn.click();
  }
  await page.getByTestId("dev-arm").click(); // close
  for (const u of urls) {
    const ok = u.startsWith(ORIGIN) || u.startsWith("blob:") || u.startsWith("data:");
    expect(ok, u).toBe(true);
  }
});
