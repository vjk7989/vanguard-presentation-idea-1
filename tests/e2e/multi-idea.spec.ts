import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getIdeaSpec, IDEA_TITLES } from "../../src/lib/ideas";
import type { IdeaKey, IdeaSpec } from "../../src/lib/ideas";
import type { Role } from "../../src/lib/domain";
import type { Snapshot, WireEvent } from "../../src/lib/store";
import { CODE, mockRoom, snapshot } from "./fixtures";

const ideas = [2, 3, 4] as const;
const views = [
  { name: "Overview", path: "" },
  { name: "Work", path: "/work" },
  { name: "Activity", path: "/activity" },
] as const;

function scenarioSnapshot(spec: IdeaSpec, role: Role | null, kind: "presenter" | "participant" = "participant"): Snapshot {
  const data = snapshot(kind, role);
  data.ideaKey = spec.id;
  data.scenario = spec.title;
  data.ideaState = spec.initialState();
  data.ideaActions = spec.actions(data.ideaState);
  data.next = null;
  data.roles = spec.roles.map((desk, index) => ({ role: desk.id as Role, claimed: role === desk.id, connected: role === desk.id,
    walletId: `DEMO-${String(index + 1).padStart(2, "0")}-${CODE}` }));
  data.presence = { online: kind === "presenter" ? 2 : 1, admins: kind === "presenter" ? 1 : 0,
    participants: 1, waiting: role ? 0 : 1, assigned: role ? 1 : 0,
    devices: [{ id: "22222222-2222-4222-8222-222222222222", label: "Pitch device 01", role, connected: true }] };
  data.mockItems = [];
  data.cases = [];
  data.practiceItems = spec.roles.map((desk, index) => ({
    itemKey: `PRACTICE-${spec.id}-${index + 1}`, ownerRole: desk.id as Role,
    counterpartyRole: spec.roles[(index + 1) % spec.roles.length].id as Role,
    title: `${desk.organization} coordination review`,
    detail: `Fictional supporting review for ${desk.title}; no main-case asset movement.`, status: "pending",
  }));
  data.events = [];
  data.latestEventIndex = 0;
  data.runs = [{ id: data.runId, runNumber: data.runNumber, ideaKey: spec.id, createdAt: "2026-10-09T00:00:00.000Z", endedAt: null }];
  return data;
}

async function noHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
    html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.html, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
}

for (const ideaKey of ideas) {
  const spec = getIdeaSpec(ideaKey)!;
  for (const desk of spec.roles) {
    test(`Idea ${ideaKey} ${desk.organization} ${desk.title} has three navigable phone and desktop views`, async ({ page }) => {
      test.setTimeout(90_000);
      await mockRoom(page, scenarioSnapshot(spec, desk.id as Role));
      for (const width of [360, 1366]) {
        await page.setViewportSize({ width, height: width === 360 ? 800 : 768 });
        for (const view of views) {
          await page.goto(`/room/${CODE}${view.path}`);
          await expect(page.getByRole("heading", { level: 1, name: desk.title })).toBeVisible();
          const nav = page.getByRole("navigation", { name: "Workspace navigation" });
          await expect(nav.getByRole("link", { name: view.name, exact: true })).toHaveAttribute("aria-current", "page");
          await expect(page.getByRole("main")).toContainText(/SIMULATION ONLY/i);
          if (view.name === "Work") {
            await expect(page.getByRole("heading", { name: desk.workTitle })).toBeVisible();
            await expect(page.getByRole("heading", { name: "Sample records" })).toBeVisible();
            await expect(page.getByRole("heading", { name: "Start practice task" })).toBeVisible();
            await expect(page.getByRole("region", { name: "Start practice task" }).getByRole("button")).toHaveCount(2);
            expect(desk.sampleRecords).toHaveLength(8);
            await expect(page.getByRole("button", { name: new RegExp(`${desk.sampleRecords[0].reference}$`, "i") })).toBeVisible();
          }
          if (view.name === "Activity") {
            await expect(page.getByRole("heading", { name: "Live accepted activity" })).toBeVisible();
            await expect(page.getByRole("heading", { name: "Sample activity" })).toBeVisible();
          }
          await noHorizontalOverflow(page);
          if (desk === spec.roles[0] && view.name === "Overview") await page.screenshot({ path: `docs/screenshots/idea-${ideaKey}-role-${width}.png`, fullPage: true, animations: "disabled" });
        }
      }
    });
  }

  test(`Idea ${ideaKey} work details support search, keyboard, reduced motion, and axe`, async ({ page }) => {
    test.setTimeout(90_000);
    const desk = spec.roles[0];
    await mockRoom(page, scenarioSnapshot(spec, desk.id as Role));
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/room/${CODE}/work`);
    const search = page.getByRole("searchbox", { name: "Search work records" });
    await search.fill(desk.sampleRecords[1].reference);
    const record = page.getByRole("button", { name: new RegExp(`${desk.sampleRecords[1].reference}$`, "i") });
    await expect(record).toBeVisible();
    await record.focus();
    await expect(record).toBeFocused();
    await record.press("Enter");
    await expect(page.getByRole("dialog").getByRole("heading", { name: desk.sampleRecords[1].title })).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(/Sample record only/i);
    await expect(page.getByRole("dialog").getByRole("button", { name: "Start related practice task" })).toBeVisible();
    await page.getByRole("button", { name: "Close details" }).click();
    const nav = page.getByRole("navigation", { name: "Workspace navigation" });
    const activity = nav.getByRole("link", { name: "Activity", exact: true });
    await activity.focus();
    await activity.press("Enter");
    await expect(page).toHaveURL(`/room/${CODE}/activity`);
    await noHorizontalOverflow(page);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(item => item.impact === "critical" || item.impact === "serious"), JSON.stringify(axe.violations)).toEqual([]);
  });

  test(`Idea ${ideaKey} practice starters create visible live work without changing scenario state`, async ({ page }) => {
    const desk = spec.roles[0];
    const data = scenarioSnapshot(spec, desk.id as Role);
    const before = structuredClone(data.ideaState);
    await mockRoom(page, data);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/room/${CODE}/work`);
    await page.getByRole("region", { name: "Start practice task" }).getByRole("button").first().click();
    await expect(page.getByRole("status")).toContainText(/Practice task opened|opened for the other desk/i);
    expect(data.practiceItems.filter(item => item.itemKey.startsWith("LIVE-"))).toHaveLength(1);
    expect(data.events.some(event => event.type === "practice_created")).toBe(true);
    expect(data.ideaState).toEqual(before);
    await noHorizontalOverflow(page);
  });

  test(`Idea ${ideaKey} work stays readable at 320–430px and 200% text`, async ({ page }) => {
    const desk = spec.roles[0];
    await mockRoom(page, scenarioSnapshot(spec, desk.id as Role));
    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/room/${CODE}/work`);
      await expect(page.getByRole("heading", { level: 1, name: desk.title })).toBeVisible();
      await noHorizontalOverflow(page);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await noHorizontalOverflow(page);
    }
  });
}

test("same QR joins Idea 2 and exposes five job-specific roles", async ({ page }) => {
  const spec = getIdeaSpec(2)!;
  const data = scenarioSnapshot(spec, null);
  await mockRoom(page, data);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/join/${CODE}`);
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
  await expect(page.getByText(`IDEA 2 · ${IDEA_TITLES[2]}`)).toBeVisible();
  for (const desk of spec.roles) await expect(page.getByRole("button", { name: `${desk.organization} · ${desk.title} · available` })).toBeVisible();
  await noHorizontalOverflow(page);
  const portfolio = page.getByRole("button", { name: `${spec.roles[0].organization} · ${spec.roles[0].title} · available` });
  await portfolio.focus();
  await portfolio.press("Enter");
  await expect(page).toHaveURL(`/room/${CODE}`);
  await expect(page.getByRole("heading", { level: 1, name: spec.roles[0].title })).toBeVisible();
});

test("Idea 3 presenter has canonical QR, diagram, comparison and an idea switcher", async ({ page }) => {
  const spec = getIdeaSpec(3)!;
  const data = scenarioSnapshot(spec, null, "presenter");
  await mockRoom(page, data);
  await page.route(`**/api/rooms/${CODE}/controls`, async route => {
    const body = route.request().postDataJSON() as { control?: string; ideaKey?: IdeaKey; mode?: Snapshot["mode"] };
    if (body.control === "switch_idea" && body.ideaKey) {
      const target = getIdeaSpec(body.ideaKey);
      if (target) {
        data.ideaKey = target.id; data.scenario = target.title;
        data.ideaState = target.initialState(); data.ideaActions = target.actions(data.ideaState);
        data.roles = target.roles.map(desk => ({ role: desk.id as Role, claimed: false, connected: false, walletId: `DEMO-${desk.id}` }));
        data.practiceItems = []; data.events = []; data.latestEventIndex = 0;
        data.revision++;
      }
    }
    if (body.control === "set_mode" && body.mode) { data.mode = body.mode; data.revision++; }
    await route.fulfill({ json: { ok: true, revision: data.revision } });
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/presenter/${CODE}`);
  await expect(page.getByRole("heading", { level: 1, name: spec.title })).toBeVisible();
  await expect(page.getByTestId("conventional-records")).toBeVisible();
  await expect(page.getByTestId("shared-ledger")).toBeVisible();
  const comparison = await page.getByTestId("shared-ledger").boundingBox();
  expect(comparison && comparison.y + comparison.height).toBeLessThanOrEqual(768);
  const diagram = page.getByRole("region", { name: "Live workflow diagram" });
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText(/Vanguard Hedge Operations Analyst/);
  await page.getByRole("button", { name: "Show QR" }).click();
  await expect(page.getByText(data.joinUrl!, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy join link" })).toBeVisible();
  await page.getByRole("switch", { name: "Show shared workflow ledger" }).click();
  await expect(page.getByRole("main")).toContainText(/With blockchain/);
  await page.getByRole("button", { name: "Open idea menu" }).click();
  const menu = page.getByRole("dialog", { name: "Switch demo idea" });
  await menu.getByRole("button", { name: new RegExp(`Idea 4.*${IDEA_TITLES[4]}`) }).click();
  await expect(page.getByRole("heading", { level: 1, name: IDEA_TITLES[4] })).toBeVisible();
  await noHorizontalOverflow(page);
});

test("an accepted Idea 2 participant click appears in the presenter workflow", async ({ browser }) => {
  const spec = getIdeaSpec(2)!;
  const first = spec.actions(spec.initialState())[0];
  const data = scenarioSnapshot(spec, first.role as Role, "presenter");
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  try {
    const presenter = await context.newPage();
    const participant = await context.newPage();
    await mockRoom(presenter, data);
    await mockRoom(participant, data);
    await participant.route(`**/api/rooms/${CODE}/idea-actions`, async route => {
      const body = route.request().postDataJSON() as { actionId: string };
      const transition = spec.transition(data.ideaState, body.actionId);
      data.ideaState = transition.state; data.ideaActions = spec.actions(data.ideaState);
      const event: WireEvent = { id: "33333333-3333-4333-8333-333333333333", index: 1, type: body.actionId,
        actor: first.role, onBehalfOf: null, label: transition.label, amount: null, reference: transition.reference,
        previousHash: "0".repeat(64), hash: "a".repeat(64), stateAfter: transition.state,
        createdAt: "2026-10-09T00:05:00.000Z", route: { source: transition.source, target: transition.target, kind: transition.pathKind } };
      data.events = [event]; data.latestEventIndex = 1; data.revision++;
      await route.fulfill({ json: { ok: true, revision: data.revision } });
    });
    await presenter.goto(`/presenter/${CODE}`);
    await participant.goto(`/room/${CODE}`);
    await participant.getByRole("button", { name: first.label }).click();
    await expect(participant.getByRole("status")).toContainText(/Guided action accepted/);
    await expect(presenter.getByRole("region", { name: "Accepted activity" })).toContainText(first.label, { timeout: 7_000 });
    await expect(presenter.getByRole("region", { name: "Live workflow diagram" })).toContainText(/Portfolio Manager/);
  } finally { await context.close(); }
});
