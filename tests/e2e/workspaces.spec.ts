import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOCK_FIXTURES, MOCK_INITIAL_STATUS } from "../../src/lib/mock-queue";
import { CODE, mockRoom, snapshot } from "./fixtures";

const roles = {
  issuer: { overview: "Liquidity & payouts", work: "Authorization queue", activity: "Treasury activity" },
  fund: { overview: "Redemptions & settlement", work: "Redemption work queue", activity: "Fund activity" },
  bank: { overview: "Payments & confirmations", work: "Confirmation queue", activity: "Bank activity" },
} as const;
const views = {
  overview: { label: "Overview", path: "" },
  work: { label: "Work", path: "/work" },
  activity: { label: "Activity", path: "/activity" },
} as const;
type RoleName = keyof typeof roles;
type ViewName = keyof typeof views;

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const [role, headings] of Object.entries(roles) as [RoleName, (typeof roles)[RoleName]][]) {
  for (const [view, destination] of Object.entries(views) as [ViewName, (typeof views)[ViewName]][]) {
    test(`${role} ${view} has its own accessible phone and desktop view`, async ({ page }) => {
      test.setTimeout(60_000);
      await mockRoom(page, snapshot("participant", role));
      for (const width of [360, 1366]) {
        await page.setViewportSize({ width, height: width === 360 ? 800 : 768 });
        await page.goto(`/room/${CODE}${destination.path}`);
        await expect(page.getByRole("heading", { level: 1, name: headings[view] })).toBeVisible();
        const nav = page.getByRole("navigation", { name: "Workspace navigation" });
        await expect(nav.getByRole("link", { name: destination.label, exact: true })).toHaveAttribute("aria-current", "page");
        await expect(nav.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("href", `/room/${CODE}`);
        await expect(nav.getByRole("link", { name: "Work", exact: true })).toHaveAttribute("href", `/room/${CODE}/work`);
        await expect(nav.getByRole("link", { name: "Activity", exact: true })).toHaveAttribute("href", `/room/${CODE}/activity`);
        await expect(page.getByRole("main")).toContainText(/SIMULATION ONLY/i);
        if (width === 360) {
          for (const link of await nav.getByRole("link").all()) {
            const target = await link.boundingBox();
            expect(target?.width).toBeGreaterThanOrEqual(44);
            expect(target?.height).toBeGreaterThanOrEqual(44);
          }
          if (view === "work") {
            const target = await page.getByRole("button", { name: /^View / }).first().boundingBox();
            expect(target?.width).toBeGreaterThanOrEqual(44);
            expect(target?.height).toBeGreaterThanOrEqual(44);
          }
        }
        await assertNoHorizontalOverflow(page);
        const a11y = await new AxeBuilder({ page }).analyze();
        expect(a11y.violations.filter(v => v.impact === "critical" || v.impact === "serious"), JSON.stringify(a11y.violations)).toEqual([]);
        await page.screenshot({ path: `docs/screenshots/${role}-${view}-${width}.png`, fullPage: true, animations: "disabled" });
      }
    });
  }
}

test("workspace navigation supports keyboard, direct links, refresh, and reduced motion", async ({ page }) => {
  await mockRoom(page, snapshot("participant", "issuer"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/room/${CODE}/work`);
  await expect(page.getByRole("heading", { level: 1, name: roles.issuer.work })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  const activity = nav.getByRole("link", { name: "Activity", exact: true });
  await activity.focus();
  await expect(activity).toBeFocused();
  await activity.press("Enter");
  await expect(page).toHaveURL(`/room/${CODE}/activity`);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: roles.issuer.activity })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

for (const role of Object.keys(roles) as RoleName[]) {
  test(`${role} can inspect and complete fictional work without moving reserve balances`, async ({ page }) => {
    const data = snapshot("participant", role);
    const openingBalances = structuredClone(data.state.balances);
    const item = MOCK_FIXTURES.find(candidate => candidate.role === role && MOCK_INITIAL_STATUS[candidate.key] === "pending");
    expect(item).toBeDefined();
    await mockRoom(page, data);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/room/${CODE}/work`);
    await page.getByRole("button", { name: `View ${item!.title}, needs review` }).click();
    await expect(page.getByRole("heading", { name: item!.title })).toBeVisible();
    await expect(page.getByRole("dialog").getByText(item!.reference)).toBeVisible();
    await page.getByRole("button", { name: item!.action }).click();
    await expect(page.getByRole("status")).toContainText(/completed|approved|matched|released/i);
    expect(data.state.balances).toEqual(openingBalances);
    expect(data.mockItems.find(candidate => candidate.key === item!.key)?.status).toBe("complete");
  });
}

test("reserve desks expose eight searchable samples and a live practice starter", async ({ page }) => {
  const data = snapshot("participant", "issuer");
  const before = structuredClone(data.state.balances);
  await mockRoom(page, data);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/room/${CODE}/work`);
  const samples = page.getByRole("region", { name: "Fictional reference records" });
  await expect(samples.getByRole("button")).toHaveCount(8);
  await samples.getByRole("searchbox", { name: "Search reference records" }).fill("SIM-ISS-2401-F1");
  await expect(samples.getByRole("button")).toHaveCount(1);
  await samples.getByRole("button").click();
  await expect(page.getByRole("dialog")).toContainText(/fictional reference only/i);
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("region", { name: "Shared desk practice tasks" }).getByRole("button", { name: "Request payee verification" }).click();
  await expect(page.getByRole("status")).toContainText(/Practice task opened|opened for the other desk/i);
  expect(data.practiceItems.some(item => item.itemKey.startsWith("LIVE-"))).toBe(true);
  expect(data.state.balances).toEqual(before);
  await assertNoHorizontalOverflow(page);
});

test("all workspaces fit narrow phones, tablets, and 200% text", async ({ page }) => {
  test.setTimeout(120_000);
  for (const role of Object.keys(roles) as RoleName[]) {
    await mockRoom(page, snapshot("participant", role));
    for (const width of [320, 390, 430, 768]) {
      await page.setViewportSize({ width, height: 800 });
      for (const view of Object.values(views)) {
        await page.goto(`/room/${CODE}${view.path}`);
        await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
        await assertNoHorizontalOverflow(page);
      }
    }
  }
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(`/room/${CODE}/work`);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await assertNoHorizontalOverflow(page);
});

test("separate browser profiles can choose separate roles in the shared room", async ({ browser }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  try {
    const participants = await Promise.all(contexts.map(context => context.newPage()));
    for (const [index, page] of participants.entries()) {
      const data = snapshot("participant", null, "lobby");
      data.roles.forEach(role => { role.claimed = false; role.connected = false; });
      await mockRoom(page, data);
      await page.goto(`/join/${CODE}`);
      await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
      const role = (Object.keys(roles) as RoleName[])[index];
      await page.getByRole("button", { name: new RegExp(role === "issuer" ? "Issuer treasury" : role === "fund" ? "Fund operations" : "Bank Payments Officer", "i") }).click();
      await expect(page).toHaveURL(`/room/${CODE}`);
      await expect(page.getByRole("heading", { level: 1, name: roles[role].overview })).toBeVisible();
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test("a second tab in one profile explains the shared role and links to its workspace", async ({ context }) => {
  const data = snapshot("participant", "fund");
  const first = await context.newPage();
  const second = await context.newPage();
  await mockRoom(first, data);
  await mockRoom(second, data);
  try {
    await first.goto(`/room/${CODE}`);
    await expect(first.getByRole("heading", { level: 1, name: roles.fund.overview })).toBeVisible();
    await second.goto(`/join/${CODE}`);
    await expect(second.getByRole("heading", { name: /This profile is already Vanguard Fund Operations Specialist/ })).toBeVisible();
    await expect(second.getByText(/another Chrome profile, private window, or device/i)).toBeVisible();
    await second.getByRole("link", { name: "Open your dashboard" }).click();
    await expect(second).toHaveURL(`/room/${CODE}`);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});

test("a fresh profile claims the sole available role through the server", async ({ page }) => {
  const data = snapshot("participant", null);
  data.roles = data.roles.map(item => ({ ...item, claimed: item.role !== "bank", connected: item.role !== "bank" }));
  let joined = false;
  let claims = 0;
  await mockRoom(page, data);
  await page.route(`**/api/rooms/${CODE}/state`, route => joined
    ? route.fulfill({ json: data })
    : route.fulfill({ status: 401, json: { error: "NO_SESSION", message: "Join this room to continue." } }));
  await page.route(`**/api/rooms/${CODE}/join`, route => { joined = true; return route.fulfill({ json: { code: CODE, runId: data.runId } }); });
  await page.route(`**/api/rooms/${CODE}/roles/claim`, route => { claims++; data.session.role = "bank";
    data.roles[2].claimed = true; data.roles[2].connected = true;
    return route.fulfill({ json: { ok: true, runId: data.runId, revision: ++data.revision } }); });
  await page.goto(`/join/${CODE}`);
  await expect(page).toHaveURL(`/room/${CODE}`);
  await expect(page.getByRole("heading", { level: 1, name: roles.bank.overview })).toBeVisible();
  expect(claims).toBe(1);
});

test("a competing last-role claim refreshes the picker without phantom assignment", async ({ page }) => {
  const data = snapshot("participant", null);
  data.roles = data.roles.map(item => ({ ...item, claimed: item.role !== "bank", connected: item.role !== "bank" }));
  let joined = false;
  await mockRoom(page, data);
  await page.route(`**/api/rooms/${CODE}/state`, route => joined
    ? route.fulfill({ json: data })
    : route.fulfill({ status: 401, json: { error: "NO_SESSION", message: "Join this room to continue." } }));
  await page.route(`**/api/rooms/${CODE}/join`, route => { joined = true; return route.fulfill({ json: { code: CODE, runId: data.runId } }); });
  await page.route(`**/api/rooms/${CODE}/roles/claim`, route => {
    data.roles[2].claimed = true;
    return route.fulfill({ status: 409, json: { error: "ROLE_TAKEN", message: "Another device claimed this role." } });
  });
  await page.goto(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
  await expect(page.getByText("All roles are occupied.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open your dashboard" })).toHaveCount(0);
});

test("a participant cannot render presenter controls from a direct URL", async ({ page }) => {
  await mockRoom(page, snapshot("participant", "fund"));
  await page.goto(`/presenter/${CODE}`);
  await expect(page.getByRole("heading", { name: "This profile is a participant" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset this idea" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open your dashboard" })).toHaveAttribute("href", `/room/${CODE}`);
});

test("presenter distinguishes claimed offline roles and shows both comparison panels", async ({ page }) => {
  const data = snapshot("presenter", null);
  data.roles[2].claimed = true; data.roles[2].connected = false;
  data.presence.devices.push({ id: "33333333-3333-4333-8333-333333333333", label: "Device 333333", role: "bank", connected: false });
  await mockRoom(page, data);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/presenter/${CODE}`);
  await expect(page.getByText("3/3 roles claimed", { exact: false })).toBeVisible();
  await expect(page.getByText("Device offline", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No device assigned", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("conventional-records")).toBeVisible();
  await expect(page.getByTestId("shared-ledger")).toBeVisible();
  await expect(page.getByRole("group", { name: "Live role and device workflow" })).toBeVisible();
  await page.getByRole("button", { name: /#2/ }).first().click();
  await expect(page.getByTestId("conventional-records")).toContainText("Event #2");
  await expect(page.getByTestId("shared-ledger")).toContainText("Shared event #2");
  const bounds = await page.getByTestId("shared-ledger").boundingBox();
  expect(bounds && bounds.y + bounds.height).toBeLessThanOrEqual(768);
  await page.screenshot({ path: "docs/screenshots/comparison-1366x768.png", animations: "disabled" });
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByTestId("conventional-records")).toBeVisible();
  await expect(page.getByTestId("shared-ledger")).toBeVisible();
  const without = await page.getByTestId("conventional-records").boundingBox();
  const withLedger = await page.getByTestId("shared-ledger").boundingBox();
  expect(withLedger!.y).toBeGreaterThan(without!.y);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: "docs/screenshots/comparison-360.png", fullPage: true, animations: "disabled" });
});

test("the admin profile explains why its own QR link cannot claim a participant role", async ({ page }) => {
  await mockRoom(page, snapshot("presenter", null, "lobby"));
  await page.goto(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "This profile is the admin" })).toBeVisible();
  await expect(page.getByText(/another Chrome profile or device/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to admin dashboard" })).toHaveAttribute("href", `/presenter/${CODE}`);
  await expect(page.getByRole("button", { name: /Issuer treasury/i })).toHaveCount(0);
});

test("a role can be changed from a secondary view", async ({ page }) => {
  const data = snapshot("participant", "issuer");
  const bank = data.roles.find(item => item.role === "bank");
  if (bank) { bank.claimed = false; bank.connected = false; }
  await mockRoom(page, data);
  await page.goto(`/room/${CODE}/work`);
  await page.getByRole("button", { name: "Change role" }).click();
  await expect(page).toHaveURL(`/join/${CODE}`);
  await page.getByRole("button", { name: /Bank Payments Officer/i }).click();
  await expect(page).toHaveURL(`/room/${CODE}`);
  await expect(page.getByRole("heading", { level: 1, name: roles.bank.overview })).toBeVisible();
});

test("a kicked participant can rejoin from a deep-linked activity view", async ({ page }) => {
  const data = snapshot("participant", "issuer");
  let kicked = false;
  await mockRoom(page, data);
  await page.route(`**/api/rooms/${CODE}/state`, route => kicked
    ? route.fulfill({ status: 401, json: { error: "NO_SESSION", message: "Join this room to continue." } })
    : route.fulfill({ json: data }));
  await page.goto(`/room/${CODE}/activity`);
  await expect(page.getByRole("heading", { level: 1, name: roles.issuer.activity })).toBeVisible();
  kicked = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "You left the demo room" })).toBeVisible();
  await page.route(`**/api/rooms/${CODE}/state`, route => route.fulfill({ json: { ...data, session: { kind: "participant", role: null } } }));
  await page.getByRole("button", { name: "Rejoin" }).click();
  await expect(page).toHaveURL(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
});

test("admin QR advertises the canonical cross-device URL and fits phone widths", async ({ page }) => {
  test.setTimeout(60_000);
  const joinUrl = `https://vanguard-presentation-idea-1.vercel.app/join/${CODE}`;
  const data = { ...snapshot("presenter", null, "lobby"), joinUrl };
  await mockRoom(page, data);
  for (const width of [320, 360, 430, 768, 1366]) {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 768 });
    await page.goto(`/presenter/${CODE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Operations control room" })).toBeVisible();
    await page.getByRole("button", { name: "Show QR" }).click();
    await expect(page.getByRole("img", { name: "QR code to join this demo room" })).toBeVisible();
    await expect(page.getByText(joinUrl, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy join link" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    if (width === 360 || width === 1366) {
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(a11y.violations.filter(v => v.impact === "critical" || v.impact === "serious"), JSON.stringify(a11y.violations)).toEqual([]);
      await page.screenshot({ path: `docs/screenshots/admin-qr-${width}.png`, fullPage: true, animations: "disabled" });
    }
  }
});
