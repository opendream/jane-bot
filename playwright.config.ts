import { defineConfig } from "@playwright/test";

// Headless Chrome already on the box; the app is served by `vite preview` bound to 127.0.0.1 only.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    serviceWorkers: "block",
    launchOptions: { executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" },
  },
  webServer: {
    command: "node scripts/serve.mjs --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
