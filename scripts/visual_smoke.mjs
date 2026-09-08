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
const expectedTitles = new Map([
  ["index.html", "PRStK Leverage & Beta Platform"],
  ["composer.html", "Portfolio Composer｜PRStK Leverage & Beta Platform"],
  ["research-lab.html", "策略實驗室｜PRStK Leverage & Beta Platform"],
  ["beta-lab.html", "Beta Lab｜PRStK Leverage & Beta Platform"],
  ["leverage-lab.html", "Leverage Lab｜PRStK Leverage & Beta Platform"],
  ["financing-lab.html", "Financing Lab｜PRStK Leverage & Beta Platform"],
  ["risk-lab.html", "Risk Lab｜PRStK Leverage & Beta Platform"],
  ["sensitivity.html", "參數敏感度｜PRStK Leverage & Beta Platform"],
  ["compare.html", "策略比較｜PRStK Leverage & Beta Platform"],
  ["stress-test.html", "質押壓力測試｜PRStK Leverage & Beta Platform"],
  ["report.html", "研究報告｜PRStK Leverage & Beta Platform"],
  ["methodology.html", "資料與方法｜PRStK Leverage & Beta Platform"],
  ["audit.html", "研究審核｜PRStK Leverage & Beta Platform"],
  ["strategies.html", "策略資料庫｜PRStK Leverage & Beta Platform"],
  ["builder.html", "策略建構器｜PRStK Leverage & Beta Platform"],
  ["dashboard.html", "互動回測工作區｜PRStK Leverage & Beta Platform"],
  ["horizons.html", "長期視窗｜PRStK Leverage & Beta Platform"],
  ["proposal.html", "研究方法｜PRStK Leverage & Beta Platform"],
]);
const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-320", width: 320, height: 800 },
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
      desktopPlatformName: document.querySelector(".brand-platform-name-desktop")?.textContent.trim() || "",
      mobilePlatformName: document.querySelector(".brand-platform-name-mobile")?.textContent.trim() || "",
      desktopPlatformVisible: Boolean(document.querySelector(".brand-platform-name-desktop") && getComputedStyle(document.querySelector(".brand-platform-name-desktop")).display !== "none"),
      mobilePlatformVisible: Boolean(document.querySelector(".brand-platform-name-mobile") && getComputedStyle(document.querySelector(".brand-platform-name-mobile")).display !== "none"),
      hasLabTabs: Boolean(document.querySelector(".lab-mobile-tabs")),
      chartBounds: [...document.querySelectorAll(".chart-shell")].map((shell) => {
        const stage = shell.querySelector(".chart-stage");
        if (!stage) return true;
        return stage.getBoundingClientRect().bottom <= shell.getBoundingClientRect().bottom + 1;
      }),
      chartTextIssues: [...document.querySelectorAll(".risk-map-figure svg, .chart-plot svg")].flatMap((svg, chartIndex) => {
        const svgBounds = svg.getBoundingClientRect();
        const texts = [...svg.querySelectorAll("[data-chart-text]")].map((node) => ({
          kind: node.getAttribute("data-chart-text"),
          text: node.textContent?.trim() || "",
          bounds: node.getBoundingClientRect(),
        }));
        const intersects = (left, right) => left.left < right.right - 0.5
          && left.right > right.left + 0.5
          && left.top < right.bottom - 0.5
          && left.bottom > right.top + 0.5;
        const collisions = [];
        for (let i = 0; i < texts.length; i += 1) {
          for (let j = i + 1; j < texts.length; j += 1) {
            if (intersects(texts[i].bounds, texts[j].bounds)) {
              collisions.push(`${texts[i].kind}:${texts[i].text} ↔ ${texts[j].kind}:${texts[j].text}`);
            }
          }
        }
        const clipped = texts
          .filter(({ bounds }) => bounds.left < svgBounds.left - 1 || bounds.right > svgBounds.right + 1 || bounds.top < svgBounds.top - 1 || bounds.bottom > svgBounds.bottom + 1)
          .map(({ kind, text }) => `${kind}:${text}`);
        return [...collisions.map((item) => `chart-${chartIndex} ${item}`), ...clipped.map((item) => `chart-${chartIndex} clipped ${item}`)];
      }),
    }));
    const platformNameValid = viewport.width <= 600
      ? state.mobilePlatformName === "L&B Platform" && state.mobilePlatformVisible
      : state.desktopPlatformName === "Leverage & Beta Platform" && state.desktopPlatformVisible;
    if (!state.title || state.title !== expectedTitles.get(pageName) || !platformNameValid || state.scrollWidth > state.viewport + 1 || state.primaryNavLinks !== 1 || state.navGroups !== 2 || state.chartBounds.includes(false) || state.chartTextIssues.length || errors.length) {
      failures.push({ page: pageName, viewport: viewport.name, state, errors });
    }
    if (viewport.width > 820) {
      const summaries = await page.locator(".site-header .nav-menu > summary").all();
      for (const [index, summary] of summaries.entries()) {
        await summary.click();
        const menuState = await page.evaluate(() => ({
          openCount: document.querySelectorAll(".site-header .nav-menu[open]").length,
          openIndex: [...document.querySelectorAll(".site-header .nav-menu")].findIndex((menu) => menu.open),
          expanded: [...document.querySelectorAll(".site-header .nav-menu > summary")].map((summary) => summary.getAttribute("aria-expanded")),
        }));
        if (menuState.openCount !== 1 || menuState.openIndex !== index || menuState.expanded.filter((value) => value === "true").length !== 1) {
          failures.push({ page: pageName, viewport: viewport.name, interaction: "desktop navigation exclusivity", menuState });
        }
        await summary.click();
        const toggledClosed = await page.evaluate(() => document.querySelectorAll(".site-header .nav-menu[open]").length === 0);
        if (!toggledClosed) failures.push({ page: pageName, viewport: viewport.name, interaction: "desktop navigation toggle close" });
      }
      const firstSummary = page.locator(".site-header .nav-menu > summary").first();
      await firstSummary.click();
      await page.locator("body").dispatchEvent("click");
      const outsideClosed = await page.evaluate(() => document.querySelectorAll(".site-header .nav-menu[open]").length === 0);
      if (!outsideClosed) failures.push({ page: pageName, viewport: viewport.name, interaction: "desktop navigation outside close" });
      await firstSummary.click();
      await page.keyboard.press("Escape");
      const escapeClosed = await page.evaluate(() => document.querySelectorAll(".site-header .nav-menu[open]").length === 0);
      if (!escapeClosed) failures.push({ page: pageName, viewport: viewport.name, interaction: "desktop navigation escape" });
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
      const summaries = page.locator(".site-header .nav-menu > summary");
      if (await summaries.count() === 2) {
        await summaries.nth(0).click();
        const firstOpen = await page.evaluate(() => ({
          openCount: document.querySelectorAll(".site-header .nav-menu[open]").length,
          expanded: [...document.querySelectorAll(".site-header .nav-menu > summary")].map((summary) => summary.getAttribute("aria-expanded")),
        }));
        await summaries.nth(1).click();
        const secondOpen = await page.evaluate(() => ({
          openCount: document.querySelectorAll(".site-header .nav-menu[open]").length,
          openIndex: [...document.querySelectorAll(".site-header .nav-menu")].findIndex((menu) => menu.open),
          expanded: [...document.querySelectorAll(".site-header .nav-menu > summary")].map((summary) => summary.getAttribute("aria-expanded")),
        }));
        if (firstOpen.openCount !== 1 || firstOpen.expanded.filter((value) => value === "true").length !== 1 || secondOpen.openCount !== 1 || secondOpen.openIndex !== 1 || secondOpen.expanded.filter((value) => value === "true").length !== 1) {
          failures.push({ page: pageName, viewport: viewport.name, interaction: "mobile navigation exclusivity", firstOpen, secondOpen });
        }
        await summaries.nth(1).click();
        const mobileToggledClosed = await page.evaluate(() => document.querySelectorAll(".site-header .nav-menu[open]").length === 0);
        if (!mobileToggledClosed) failures.push({ page: pageName, viewport: viewport.name, interaction: "mobile navigation toggle close" });
        await summaries.nth(0).click();
        await page.locator("body").dispatchEvent("click");
        const mobileOutsideClosed = await page.evaluate(() => document.querySelectorAll(".site-header .nav-menu[open]").length === 0);
        if (!mobileOutsideClosed) failures.push({ page: pageName, viewport: viewport.name, interaction: "mobile navigation outside close" });
      }
      await page.keyboard.press("Escape");
      const menuClosed = await page.evaluate(() => !document.body.classList.contains("nav-open") && document.querySelectorAll(".site-header .nav-menu[open]").length === 0);
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
