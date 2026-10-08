import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL, trace: "retain-on-failure" },
  webServer: externalBaseUrl ? undefined : {
    command: "pnpm dev --port 3100",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { APP_ORIGIN: baseURL },
  },
});
