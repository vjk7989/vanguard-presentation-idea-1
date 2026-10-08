import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CODE, mockRoom, snapshot } from "./fixtures";

test("anyone can open the shared control room without an access code", async ({ page }) => {
  await mockRoom(page, snapshot("presenter", null, "lobby"));
  await page.route("**/api/rooms", route => route.fulfill({ json: { code: CODE, runId: "11111111-1111-4111-8111-111111111111" }, status: 201 }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Run the live demo" })).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: "docs/screenshots/home-1366x768.png", fullPage: true });
  await page.getByRole("button", { name: "Enter admin dashboard" }).click();
  await expect(page).toHaveURL(`/presenter/${CODE}`);
  await expect(page.getByRole("heading", { name: "Role positions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Devices in the room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show QR" })).toBeVisible();
});

test("setup explains a server error without leaving the page", async ({ page }) => {
  await page.route("**/api/rooms", route => route.fulfill({ status: 500, json: { error: "SERVER_ERROR", message: "The server could not complete this request." } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Enter admin dashboard" }).click();
  await expect(page.getByText("The server could not complete this request.")).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("presenter dashboard shows pending cash, comparison and event detail", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await mockRoom(page, snapshot("presenter", null));
  await page.goto(`/presenter/${CODE}`);
  await expect(page.getByRole("heading", { name: "Operations control room" })).toBeVisible();
  await expect(page.getByLabel("QR code to join this room")).toHaveCount(0);
  await page.getByRole("button", { name: "Show QR" }).click();
  await expect(page.getByLabel("QR code to join this room")).toBeVisible();
  await page.getByRole("button", { name: "Kick Device 222222" }).click();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
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

test("a kicked participant can rejoin and choose a role", async ({ page }) => {
  const data = snapshot("participant", "issuer");
  let kicked = false;
  await mockRoom(page, data);
  await page.route(`**/api/rooms/${CODE}/state`, route => kicked
    ? route.fulfill({ status: 401, json: { error: "NO_SESSION", message: "Join this room to continue." } })
    : route.fulfill({ json: data }));
  await page.goto(`/room/${CODE}`);
  await expect(page.getByRole("heading", { name: "Liquidity & payouts" })).toBeVisible();
  kicked = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "You left the demo room" })).toBeVisible();
  await page.route(`**/api/rooms/${CODE}/state`, route => route.fulfill({ json: { ...data, session: { kind: "participant", role: null } } }));
  await page.getByRole("button", { name: "Rejoin" }).click();
  await expect(page).toHaveURL(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
});

test("participant can claim an available role from a join link", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockRoom(page, snapshot("participant", null, "lobby"));
  await page.goto(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/join-360.png", fullPage: true });
  await page.getByRole("button", { name: /Fund operations/ }).click();
  await expect(page).toHaveURL(`/room/${CODE}`);
  await expect(page.getByRole("heading", { name: "Redemptions & settlement" })).toBeVisible();
});

test("scanning a join link registers a new device without an extra join button", async ({ page }) => {
  const data = snapshot("participant", null, "lobby");
  let joined = false;
  let joinCount = 0;
  await mockRoom(page, data);
  await page.route(`**/api/rooms/${CODE}/state`, route => joined
    ? route.fulfill({ json: data })
    : route.fulfill({ status: 401, json: { error: "NO_SESSION", message: "Join this room to continue." } }));
  await page.route(`**/api/rooms/${CODE}/join`, route => { joined = true; joinCount++; return route.fulfill({ json: { code: CODE, runId: data.runId } }); });
  await page.goto(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fund operations/ })).toBeVisible();
  expect(joinCount).toBe(1);
  await expect(page.getByRole("button", { name: "Join room" })).toHaveCount(0);
});

test("a participant can release a role and choose another", async ({ page }) => {
  const data = snapshot("participant", "issuer");
  const bank = data.roles.find(role => role.role === "bank");
  if (bank) { bank.claimed = false; bank.connected = false; }
  await mockRoom(page, data);
  await page.goto(`/room/${CODE}`);
  await page.getByRole("button", { name: "Change role" }).click();
  await expect(page).toHaveURL(`/join/${CODE}`);
  await page.getByRole("button", { name: /Bank operations/ }).click();
  await expect(page).toHaveURL(`/room/${CODE}`);
  await expect(page.getByRole("heading", { name: "Payments & confirmations" })).toBeVisible();
});

test("a fictional approval updates its status without changing Friday cash", async ({ page }) => {
  const data = snapshot("participant", "issuer");
  await mockRoom(page, data);
  await page.goto(`/room/${CODE}`);
  await page.getByRole("button", { name: /Operations vendor payout/ }).click();
  await expect(page.getByRole("heading", { name: "Operations vendor payout" })).toBeVisible();
  await page.getByRole("button", { name: "Approve payout" }).click();
  await expect(page.getByRole("status")).toContainText("completed");
  await expect(page.getByRole("heading", { name: "Operations vendor payout" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Operations vendor payout.*Approved/ })).toBeVisible();
  expect(data.state.balances.cash).toBe("30000000000");
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});

test("admin sees and can kick a device that has not selected a role", async ({ page }) => {
  const data = snapshot("presenter", null, "lobby");
  data.presence = { online: 2, admins: 1, participants: 1, waiting: 1, assigned: 0,
    devices: [{ id: "33333333-3333-4333-8333-333333333333", label: "Device 333333", role: null, connected: true }] };
  await mockRoom(page, data);
  await page.goto(`/presenter/${CODE}`);
  await expect(page.getByText("1 choosing a role")).toBeVisible();
  await page.getByRole("button", { name: "Kick Device 333333" }).click();
  await expect(page.getByText("0 choosing a role")).toBeVisible();
  await expect(page.getByText("No participant devices yet.", { exact: false })).toBeVisible();
});

for (const [role, heading] of [["issuer", "Liquidity & payouts"], ["fund", "Redemptions & settlement"], ["bank", "Payments & confirmations"]] as const) {
  test(`${role} workspace is distinct and readable at phone widths`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await mockRoom(page, snapshot("participant", role));
    await page.goto(`/room/${CODE}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/${role}-360.png`, fullPage: true });
    await page.setViewportSize({ width: 430, height: 900 });
    await page.screenshot({ path: `docs/screenshots/${role}-430.png`, fullPage: true });
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });
}

test("join view and participant task work at phone widths", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockRoom(page, snapshot("participant", "bank"));
  await page.goto(`/room/${CODE}`);
  await expect(page.getByRole("heading", { name: "Payments & confirmations" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirm incoming/ })).toBeEnabled();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/screenshots/participant-360.png", fullPage: true });
  await page.setViewportSize({ width: 430, height: 900 });
  await page.screenshot({ path: "docs/screenshots/participant-430.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const overflow = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5).map(element => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 40), right: element.getBoundingClientRect().right })) }));
  expect(overflow, JSON.stringify(overflow)).toMatchObject({ scroll: overflow.width });
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
});

test("results replay is keyboard accessible", async ({ page }) => {
  await mockRoom(page, snapshot("presenter", null));
  await page.goto(`/results/${CODE}`);
  await expect(page.getByRole("heading", { name: "Results and replay" })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Replay event" });
  await slider.focus();
  await slider.press("Home");
  await expect(page.getByText("Event 0 / 3")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/results-1366.png", fullPage: true });
});
