import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CODE, mockRoom, snapshot } from "./fixtures";

test("presenter can create a room from the setup screen", async ({ page }) => {
  await mockRoom(page, snapshot("presenter", null, "lobby"));
  await page.route("**/api/rooms", route => route.fulfill({ json: { code: CODE, runId: "11111111-1111-4111-8111-111111111111" }, status: 201 }));
  await page.goto("/");
  await page.getByLabel("Presenter access code").fill("fixture-code");
  await page.getByRole("button", { name: "Create demo room" }).click();
  await expect(page).toHaveURL(`/presenter/${CODE}`);
  await expect(page.getByRole("heading", { name: "Role positions" })).toBeVisible();
  await expect(page.getByRole("main").getByText("ABC123", { exact: true })).toBeVisible();
});

test("setup explains a rejected access code without leaving the page", async ({ page }) => {
  await page.route("**/api/rooms", route => route.fulfill({ status: 403, json: { error: "ACCESS_DENIED", message: "The presenter code is incorrect." } }));
  await page.goto("/");
  await page.getByLabel("Presenter access code").fill("wrong-code");
  await page.getByRole("button", { name: "Create demo room" }).click();
  await expect(page.getByText("The presenter code is incorrect.")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("presenter dashboard shows pending cash, comparison and event detail", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockRoom(page, snapshot("presenter", null));
  await page.goto(`/presenter/${CODE}`);
  await expect(page.getByRole("heading", { name: "Operations control room" })).toBeVisible();
  await expect(page.getByText("$200m", { exact: true })).toBeVisible();
  await expect(page.getByText("$300m", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Fund holdings fell to/ }).click();
  await expect(page.getByRole("heading", { name: "Event detail" })).toBeVisible();
  await expect(page.getByText("Technical identifiers")).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByRole("heading", { name: "Event detail" })).toBeHidden();
  await page.getByRole("switch", { name: "Show shared workflow ledger" }).click();
  await expect(page.getByText("Shared workflow ledger")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/dashboard-1366x768.png", fullPage: true });
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  await page.getByRole("button", { name: "Use dark mode" }).click();
  await page.waitForTimeout(300);
  const darkA11y = await new AxeBuilder({ page }).analyze();
  expect(darkA11y.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});

test("participant can claim an available role from a join link", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockRoom(page, snapshot("participant", null, "lobby"));
  await page.goto(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "Choose your role" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/join-360.png", fullPage: true });
  await page.getByRole("button", { name: /Fund operations/ }).click();
  await expect(page).toHaveURL(`/room/${CODE}`);
  await expect(page.getByRole("heading", { name: "Fund operations" })).toBeVisible();
});

test("join view and participant task work at phone widths", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockRoom(page, snapshot("participant", "bank"));
  await page.goto(`/room/${CODE}`);
  await expect(page.getByRole("heading", { name: "Bank operations" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirm incoming/ })).toBeEnabled();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/screenshots/participant-360.png", fullPage: true });
  await page.setViewportSize({ width: 430, height: 900 });
  await page.screenshot({ path: "docs/screenshots/participant-430.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});

test("results replay is keyboard accessible", async ({ page }) => {
  await mockRoom(page, snapshot("presenter", null));
  await page.goto(`/results/${CODE}`);
  await expect(page.getByRole("heading", { name: "Results and replay" })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Replay step" });
  await slider.focus();
  await slider.press("Home");
  await expect(page.getByText("Step 0 / 6")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/results-1366.png", fullPage: true });
});
