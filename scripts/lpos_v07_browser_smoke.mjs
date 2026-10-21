import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
const playwrightModule = process.env.LPOS_PLAYWRIGHT_MODULE || "playwright";
const playwrightImport = playwrightModule.includes(":\\") || playwrightModule.startsWith("/")
  ? pathToFileURL(playwrightModule).href : playwrightModule;
const { chromium, firefox, webkit } = await import(playwrightImport);

const repoPrefix = "/prstk-taiwan-etf-research/";
const appPath = process.env.LPOS_APP_PATH || "lpos-portfolio-lab/";
const lposPrefix = repoPrefix + appPath;
const dataPrefix = appPath.includes("/preview/") ? lposPrefix + "data/" : repoPrefix + "data/";
const publishRoot = resolve(process.env.LPOS_STATIC_ROOT || "site");
const buildRoot = process.env.LPOS_STATIC_ROOT ? resolve(publishRoot, "lpos-portfolio-lab") : resolve("apps/lpos/dist");
const publicBase = process.env.LPOS_BASE_URL;
let server;
// LPOS_BASE_URL may include the repository subpath; navigation below appends
// repoPrefix, so use only the origin to avoid duplicating that path.
let base = publicBase ? new URL(publicBase).origin : undefined;
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml", ".woff": "font/woff",
  ".png": "image/png", ".webmanifest": "application/manifest+json"
};

if (!base) {
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (!pathname.startsWith(repoPrefix)) throw new Error("outside project base");
      const relative = pathname.slice(repoPrefix.length) || "index.html";
      const isLpos = relative.startsWith("lpos-portfolio-lab/");
      const root = isLpos ? buildRoot : publishRoot;
      const file = resolve(root, isLpos ? relative.slice("lpos-portfolio-lab/".length) : relative);
      if (!file.startsWith(root + sep) && file !== root) throw new Error("outside static root");
      res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(await readFile(file));
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  base = "http://127.0.0.1:" + server.address().port;
}

const dataManifestResponse = await fetch(base + dataPrefix + "manifest.json");
assert.ok(dataManifestResponse.ok, "published data manifest must be reachable");
const dataManifest = await dataManifestResponse.json();
const dataManifestDate = dataManifest.generated_at_utc?.slice(0, 10);
assert.match(dataManifestDate || "", /^\d{4}-\d{2}-\d{2}$/, "published data manifest must identify its generation date");
const priceResponse = await fetch(base + dataPrefix + "backtests/buy_hold_006208.csv");
assert.ok(priceResponse.ok, "published buy-and-hold price series must be reachable");
const priceBytes = Buffer.from(await priceResponse.arrayBuffer());
const latestResearchDate = priceBytes.toString("utf8").trim().split(/\r?\n/).at(-1)?.split(",")[0]?.trim();
assert.match(latestResearchDate || "", /^\d{4}-\d{2}-\d{2}$/, "published price series must end with an actual data date");
assert.ok(latestResearchDate <= dataManifestDate, "price series date must not exceed its published data manifest date");

await mkdir("artifacts/lpos-v07", { recursive: true });
const failures = [];
const requestedEngines = process.env.LPOS_BROWSER_ENGINES?.split(",").map(x => x.trim()).filter(Boolean);
const waitForRun = async page => {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return text.includes("研究完成。你可以查看總覽或前往報告中心。") || text.includes("研究 Worker 發生錯誤") || text.includes("研究包重現失敗");
  }, null, { timeout: 120000 });
  const body = await page.locator("body").innerText();
  assert.ok(!body.includes("研究 Worker 發生錯誤") && !body.includes("研究包重現失敗"), body);
};
const nav = async (page, id) => {
  const desktop = page.locator(".side-nav");
  const visible = await desktop.isVisible() ? desktop : page.locator(".mobile-nav");
  const names = { overview: ["負擔試算", "試算"], setup: ["設定", "設定"], tools: ["進階研究與工具", "進階"] };
  if (id === "research" || id === "compare" || id === "report") {
    await visible.getByRole("button", { name: names.tools[await desktop.isVisible() ? 0 : 1] }).click();
    const card = { research: "歷史研究", compare: "A／B／C 公平比較", report: "研究報告與下載" }[id];
    await page.getByRole("button", { name: new RegExp(card) }).click();
    return;
  }
  await visible.getByRole("button", { name: names[id][await desktop.isVisible() ? 0 : 1] }).click();
};

try {
  const engines = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]
    .filter(([name]) => !requestedEngines || requestedEngines.includes(name));
  for (const [engineName, engine] of engines) {
    const browser = await engine.launch({ headless: true, ...(process.env.PRSTK_BROWSER_PATH ? { executablePath: process.env.PRSTK_BROWSER_PATH } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(String(error)));
      await page.goto(base + lposPrefix + "index.html", { waitUntil: "networkidle" });
      await page.getByText("LPOS PORTFOLIO LAB / V0.7.1").waitFor();
      await nav(page, "setup");
      await page.getByRole("button", { name: "載入回測示範" }).click();
      await page.locator(".wizard-steps button").nth(1).click();
      await page.locator("summary", { hasText: "保存 A/B/C 情境" }).click();
      await page.getByRole("button", { name: "儲存 A" }).click();
      await page.getByRole("button", { name: "儲存 B" }).click();
      await page.getByRole("button", { name: "儲存 C" }).click();
      await nav(page, "research");
      await page.locator("#date-from").fill("2024-01-02");
      await page.locator("#date-to").fill(latestResearchDate);
      await page.getByRole("button", { name: "開始完整研究" }).click();
      await waitForRun(page);
      await nav(page, "overview");
      await page.locator(".history-summary > summary").click();
      await page.getByText("正式結論受阻", { exact: true }).first().waitFor();
      await page.getByText("同標的無借款 CAGR", { exact: true }).waitFor();
      assert.ok((await page.locator("body").innerText()).includes("研究行情是調整價格代理，非已驗證含息真實可執行融資回測。"));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), engineName + " desktop overflow");
      if (engineName === "chromium") await page.screenshot({ path: "artifacts/lpos-v07/desktop-overview.png", fullPage: true });

      await nav(page, "compare");
      await page.getByText("同期間結果").waitFor();
      const compareText = await page.locator("main").innerText();
      const resultNames = await page.locator("main table tbody tr td:first-child").allTextContents();
      assert.deepEqual(resultNames.slice(0, 3), ["A", "B", "C"], "A/B/C results must be present");
      assert.ok(!compareText.includes("相同自有資金"), "fair comparison should use equal capital");
      assert.ok(compareText.includes("三方案均覆蓋完整共同期間") || compareText.includes("至少一個方案未覆蓋完整期間"));

      await nav(page, "report");
      await page.getByText("同標的無借款基準", { exact: true }).first().waitFor();
      for (const section of ["1｜研究摘要", "2｜配置與融資", "3｜方法與證據", "4｜報酬研究", "5｜公平比較", "6｜生存分析", "7｜一致性檢查", "8｜來源與限制附錄"]) {
        await page.getByRole("heading", { name: section }).waitFor();
      }
      if (engineName === "chromium") {
        const [pdfDownload] = await Promise.all([
          page.waitForEvent("download", { timeout: 120000 }),
          page.getByRole("button", { name: "下載 PDF 報告" }).click()
        ]);
        await pdfDownload.saveAs("artifacts/lpos-v07/representative-report.pdf");
        const [bundleDownload] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "下載研究重現包" }).click()
        ]);
        const bundlePath = "artifacts/lpos-v07/replay-bundle.json";
        await bundleDownload.saveAs(bundlePath);
        await nav(page, "tools");
        await page.getByRole("button", { name: /匯入與資料備份/ }).click();
        await page.locator('input[type="file"]').setInputFiles(bundlePath);
        await page.getByRole("dialog").waitFor();
        await page.getByRole("button", { name: "套用匯入" }).click();
        await page.getByRole("heading", { name: "LPOS Portfolio Lab｜研究報告" }).waitFor({ timeout: 120000 });
        await page.getByText("研究包已使用封存價格與相同版本模型重新計算", { exact: false }).waitFor({ timeout: 120000 });
        await nav(page, "setup");
        await page.getByRole("button", { name: /返回設定步驟/ }).click();
        await page.locator(".wizard-steps button").nth(2).click();
        await page.locator("#current-aprPct").fill("5");
        await page.getByText("設定已變更，舊研究結果已隱藏。請重新計算。").waitFor();
        await nav(page, "report");
        assert.ok((await page.locator("body").innerText()).includes("目前報告已過期"));
      }

      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobile = await mobileContext.newPage();
      const mobileErrors = [];
      mobile.on("pageerror", error => mobileErrors.push(String(error)));
      await mobile.goto(base + lposPrefix + "index.html", { waitUntil: "networkidle" });
      assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), engineName + " mobile page overflow");
      const navHeights = await mobile.locator(".mobile-nav button").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
      assert.equal(navHeights.length, 3, "mobile navigation should expose the three simplified entry points");
      assert.ok(navHeights.every(height => height >= 44), engineName + " mobile nav tap target below 44px");
      await nav(mobile, "setup");
      const ownCapital = mobile.locator("#current-ownCapital");
      await ownCapital.focus();
      await ownCapital.press("Control+A");
      await ownCapital.press("Backspace");
      await ownCapital.pressSequentially("0");
      await mobile.waitForTimeout(100);
      assert.equal(await ownCapital.getAttribute("aria-invalid"), "true", engineName + " zero capital should show validation");
      assert.equal(await mobile.locator("#root").innerText().then(text => text.length > 0), true, engineName + " root must remain mounted for zero input");
      assert.equal(await ownCapital.evaluate(el => document.activeElement === el), true, engineName + " input focus must survive controlled rerender");
      await ownCapital.press("Control+A");
      await ownCapital.fill("1,250,000.5");
      assert.equal(await ownCapital.getAttribute("aria-invalid"), "false", engineName + " decimal capital should be accepted");
      assert.equal(await ownCapital.inputValue(), "1,250,000.5", engineName + " formatting must not rewrite the active input");
      if (engineName === "chromium") {
        await mobileContext.grantPermissions(["clipboard-read", "clipboard-write"]);
        await mobile.evaluate(async () => navigator.clipboard.writeText("１，２５０，０００.５"));
        await ownCapital.focus();
        await ownCapital.press("Control+A");
        await ownCapital.press("Control+V");
        await mobile.waitForTimeout(50);
        assert.equal(await ownCapital.inputValue(), "１，２５０，０００.５", "full-width pasted value should remain visible while editing");
        assert.equal(await ownCapital.getAttribute("aria-invalid"), "false", "full-width pasted amount should be accepted");
      }
      const monthlyCashflow = mobile.locator("#current-monthlyFreeCashFlow");
      await monthlyCashflow.focus();
      await monthlyCashflow.press("Control+A");
      await monthlyCashflow.press("Backspace");
      await monthlyCashflow.pressSequentially("-");
      assert.equal(await monthlyCashflow.getAttribute("aria-invalid"), "true", engineName + " unfinished negative input should stay an invalid draft");
      await monthlyCashflow.press("Control+A");
      await monthlyCashflow.pressSequentially("-25000.75");
      assert.equal(await monthlyCashflow.getAttribute("aria-invalid"), "false", engineName + " negative decimal cashflow should be accepted");
      await monthlyCashflow.evaluate(el => el.blur());
      await mobile.waitForTimeout(750);
      await mobile.reload({ waitUntil: "networkidle" });
      await nav(mobile, "setup");
      assert.equal(await mobile.locator("#current-ownCapital").inputValue(), "1,250,000.5", engineName + " capital draft should restore after blur formatting");
      assert.equal(await mobile.locator("#current-monthlyFreeCashFlow").inputValue(), "-25,000.75", engineName + " cashflow should restore after blur formatting");
      assert.equal(await mobile.locator("#current-monthlyFreeCashFlow").getAttribute("aria-invalid"), "false", engineName + " grouped negative cashflow should reload as valid");
      if (engineName === "chromium") await mobile.screenshot({ path: "artifacts/lpos-v07/mobile-setup.png", fullPage: true });
      await nav(mobile, "tools");
      if (engineName === "chromium") await mobile.screenshot({ path: "artifacts/lpos-v07/mobile-tools.png", fullPage: true });
      await mobile.getByRole("button", { name: /生存分析假設/ }).click();
      await mobile.locator("#sv-horizon").waitFor();
      for (const width of [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920]) {
        await mobile.setViewportSize({ width, height: 900 });
        assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), engineName + " page overflow at " + width + "px");
      }
      await mobile.setViewportSize({ width: 390, height: 844 });
      assert.ok(Number(await mobile.locator("#sv-horizon").evaluate(el => getComputedStyle(el).fontSize.replace("px", ""))) >= 16, engineName + " mobile form text below 16px");
      assert.deepEqual(pageErrors, [], engineName + " uncaught desktop page errors");
      assert.deepEqual(mobileErrors, [], engineName + " uncaught mobile page errors");
      await mobileContext.close();
      await context.close();
      console.log("PASS LPOS V0.7.1 browser:", engineName, base + lposPrefix);
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  failures.push(error);
} finally {
  if (server) await new Promise(resolveClose => server.close(resolveClose));
}
if (failures.length) throw failures[0];
