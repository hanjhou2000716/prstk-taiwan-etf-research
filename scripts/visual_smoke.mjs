import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve("site");
const port = 8765;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    const requested = decodeURIComponent((request.url || "/").split("?")[0]);
    const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
    if (relative === "data/deployment.json") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ commit_sha: "visual-smoke", data_end_date: "local", model_version: "local", deployed_at: "local" }));
      return;
    }
    if (relative === "favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const file = normalize(join(root, relative));
    if (!file.startsWith(root)) throw new Error("path outside site");
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

await new Promise((resolveServer) => server.listen(port, "127.0.0.1", resolveServer));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PRSTK_BROWSER_PATH || undefined,
});
await mkdir("artifacts/ui-smoke", { recursive: true });
const pages = [
  "index.html",
  /* TEMP */
  "composer.html",
  "research-lab.html",
  "beta-lab.html",
  "leverage-lab.html",
  "financing-lab.html",
  "risk-lab.html",
  "sensitivity.html",
  "compare.html",
  "stress-test.html",
  "report.html",
  "methodology.html",
  "audit.html",
  "strategies.html",
  "builder.html",
  "dashboard.html",
  "horizons.html",
  "proposal.html",
];
const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
];
const selectedPages = process.env.PRSTK_SMOKE_PAGES ? pages.filter((page) => process.env.PRSTK_SMOKE_PAGES.split(",").includes(page)) : pages;
const selectedViewports = process.env.PRSTK_SMOKE_VIEWPORTS ? viewports.filter((viewport) => process.env.PRSTK_SMOKE_VIEWPORTS.split(",").includes(viewport.name)) : viewports;
const failures = [];

for (const viewport of selectedViewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  for (const pageName of selectedPages) {
    console.log(`smoke: ${viewport.name} ${pageName}`);
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/${pageName}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      title: document.title,
      viewport: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      navLinks: document.querySelectorAll(".site-header .nav a").length,
      primaryNavLinks: document.querySelectorAll(".site-header .nav > a").length,
      navGroups: document.querySelectorAll(".site-header .nav > .nav-menu").length,
      chartCount: document.querySelectorAll(".chart-plot svg, #riskMap svg").length,
      hasMenu: Boolean(document.querySelector(".menu-toggle")),
      hasLabTabs: Boolean(document.querySelector(".lab-mobile-tabs")),
      chartBounds: [...document.querySelectorAll(".chart-shell")].map((shell) => {
        const stage = shell.querySelector(".chart-stage");
        if (!stage) return true;
        return stage.getBoundingClientRect().bottom <= shell.getBoundingClientRect().bottom + 1;
      }),
    }));
    if (!state.title || state.scrollWidth > state.viewport + 1 || state.primaryNavLinks !== 1 || state.navGroups !== 2 || state.chartBounds.includes(false) || errors.length) {
      failures.push({ page: pageName, viewport: viewport.name, state, errors });
    }
    if (viewport.width > 820) {
      for (const summary of await page.locator(".site-header .nav-menu > summary").all()) {
        await summary.click();
        const isOpen = await summary.evaluate((element) => element.parentElement?.open === true);
        if (!isOpen) failures.push({ page: pageName, viewport: viewport.name, interaction: "navigation group toggle" });
      }
    }
    if (viewport.width <= 820 && state.hasMenu) {
      const menuButton = page.locator(".menu-toggle");
      if (!(await menuButton.count())) {
        failures.push({ page: pageName, viewport: viewport.name, interaction: "mobile navigation button missing" });
      } else {
        await menuButton.click({ timeout: 5000 });
      }
      const menuState = await page.evaluate(() => ({
        open: document.body.classList.contains("nav-open"),
        visibleLinks: document.querySelectorAll(".site-header .nav.open a").length,
      }));
      if (!menuState.open || menuState.visibleLinks < 5) {
        failures.push({ page: pageName, viewport: viewport.name, interaction: "mobile navigation", menuState });
      }
      await page.keyboard.press("Escape");
      const menuClosed = await page.evaluate(() => !document.body.classList.contains("nav-open"));
      if (!menuClosed) failures.push({ page: pageName, viewport: viewport.name, interaction: "mobile navigation escape" });
    }
    if (viewport.width <= 820 && state.hasLabTabs) {
      const parametersTab = page.locator('.lab-mobile-tab[data-lab-view="parameters"]');
      if (!(await parametersTab.count())) {
        failures.push({ page: pageName, viewport: viewport.name, interaction: "parameter tab missing" });
        await page.close();
        continue;
      }
      await parametersTab.click({ timeout: 5000 });
      const sheetState = await page.evaluate(() => ({
        open: document.body.classList.contains("lab-parameters-open"),
        dialog: document.querySelector('[data-lab-panel="parameters"]')?.getAttribute("role"),
        hidden: document.querySelector('[data-lab-panel="parameters"]')?.getAttribute("aria-hidden"),
      }));
      if (!sheetState.open || sheetState.dialog !== "dialog" || sheetState.hidden !== "false") {
        failures.push({ page: pageName, viewport: viewport.name, interaction: "parameter sheet", sheetState });
      }
      await page.locator(".lab-parameters-close").click({ timeout: 5000 });
      const sheetClosed = await page.evaluate(() => ({
        closed: !document.body.classList.contains("lab-parameters-open"),
        focusId: document.activeElement?.id || "",
      }));
      if (!sheetClosed.closed) failures.push({ page: pageName, viewport: viewport.name, interaction: "parameter sheet close" });
      if (sheetClosed.focusId !== "lab-tab-parameters") failures.push({ page: pageName, viewport: viewport.name, interaction: "parameter sheet focus restore", sheetClosed });
    }
    await page.screenshot({ path: `artifacts/ui-smoke/${viewport.name}-${pageName.replace(".html", "")}.png`, fullPage: true });
    await page.close();
  }
  await context.close();
}

await browser.close();
server.closeAllConnections?.();
await new Promise((resolveServer) => server.close(resolveServer));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
} else {
  console.log(`responsive visual smoke passed: ${pages.length} pages × ${viewports.length} viewports`);
}
