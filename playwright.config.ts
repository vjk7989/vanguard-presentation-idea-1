import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: { command: "pnpm dev --port 3100", url: "http://127.0.0.1:3100", timeout: 120_000, reuseExistingServer: false,
    env: { APP_ORIGIN: "http://127.0.0.1:3100" } },
});
