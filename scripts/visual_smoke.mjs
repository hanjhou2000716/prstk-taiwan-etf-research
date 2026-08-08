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
const browser = await chromium.launch({ headless: true });
await mkdir("artifacts/ui-smoke", { recursive: true });
const pages = ["index.html", "research-lab.html", "compare.html", "stress-test.html", "report.html"];
const viewports = [
  { name: "mobile-320", width: 320, height: 780 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1440", width: 1440, height: 1000 },
];
const failures = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  for (const pageName of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/${pageName}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      title: document.title,
      viewport: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      navLinks: document.querySelectorAll(".site-header .nav a").length,
      chartCount: document.querySelectorAll(".chart-plot svg, #riskMap svg").length,
    }));
    if (!state.title || state.scrollWidth > state.clientWidth + 1 || errors.length) {
      failures.push({ page: pageName, viewport: viewport.name, state, errors });
    }
    await page.screenshot({ path: `artifacts/ui-smoke/${viewport.name}-${pageName.replace(".html", "")}.png`, fullPage: true });
    await page.close();
  }
  await context.close();
}

await browser.close();
await new Promise((resolveServer) => server.close(resolveServer));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
} else {
  console.log(`responsive visual smoke passed: ${pages.length} pages × ${viewports.length} viewports`);
}
