const waitForMetrics = () => new Promise((resolve) => {
  const tick = () => { const node = document.querySelector("#metrics"); if (node) resolve(node); else setTimeout(tick, 25); };
  tick();
});

const [catalog, baseline, manifest, reconciliation] = await Promise.all([
  fetch("data/strategy-catalog.json").then((response) => response.json()),
  fetch("data/baseline_metrics.json").then((response) => response.json()),
  fetch("data/manifest.json").then((response) => response.json()),
  fetch("data/reconciliation_report.json").then((response) => response.json()).catch(() => ({})),
]);
await waitForMetrics();

const rows = baseline.filter((row) => row.status === "available");
const actual = catalog.strategies
  .filter((strategy) => strategy.data_type === "actual_etf" && strategy.implementation_status === "verified")
  .map((strategy) => ({ strategy, metrics: rows.find((row) => row.strategy === strategy.strategy_id) }))
  .filter((row) => row.metrics);
const best = actual.slice().sort((a, b) => (b.metrics.cagr || 0) - (a.metrics.cagr || 0))[0];
const worst = actual.slice().sort((a, b) => (a.metrics.max_drawdown || 0) - (b.metrics.max_drawdown || 0))[0];

const section = document.createElement("section");
section.className = "section";
section.innerHTML = `
  <div class="section-title"><h2>有證據來源的執行摘要</h2><p>以下文字只由 baseline metrics、catalog、manifest 與 reconciliation 產生。</p></div>
  <div class="grid-2"><div class="note"><strong>研究範圍</strong><br><span id="reportCoverage"></span></div><div class="note danger-note"><strong>發布狀態</strong><br><span id="reportReadiness"></span></div></div>
  <div class="table-wrap" style="margin-top:16px"><table class="data-table"><thead><tr><th scope="col">策略</th><th scope="col">資料類型</th><th scope="col">CAGR</th><th scope="col">Beta 006208</th><th scope="col">Sharpe</th><th scope="col">最大回撤</th><th scope="col">CVaR 95%</th></tr></thead><tbody id="evidenceRows"></tbody></table></div>
  <div class="note" style="margin-top:16px"><strong>確定性觀察：</strong><span id="deterministicText"></span></div>`;
document.querySelector("main").insertBefore(section, document.querySelector("footer"));

section.querySelector("#reportCoverage").textContent = `${manifest.data_end_date || "資料日期未知"} · ${rows.length} 策略有 baseline metrics · Actual verified ${actual.length} 策略`;
section.querySelector("#reportReadiness").textContent = reconciliation.formal_conclusions_blocked ? "正式結論目前阻擋：validation layers 尚未全部通過。" : "reconciliation publish readiness passed。";
section.querySelector("#deterministicText").textContent = best && worst
  ? `在已驗證 Actual ETF 樣本內，CAGR 最高者為 ${best.strategy.display_name}（${((best.metrics.cagr || 0) * 100).toFixed(2)}%），最大歷史回撤最深者為 ${worst.strategy.display_name}（${((worst.metrics.max_drawdown || 0) * 100).toFixed(2)}%）。這是樣本描述，不是未來報酬推薦。`
  : "目前沒有足夠 verified Actual ETF 指標可產生摘要。";

const cell = (text) => { const node = document.createElement("td"); node.textContent = text; return node; };
const evidenceBody = section.querySelector("#evidenceRows");
evidenceBody.replaceChildren(...catalog.strategies.map((strategy) => {
  const row = rows.find((item) => item.strategy === strategy.strategy_id);
  const tr = document.createElement("tr");
  tr.append(
    cell(strategy.display_name),
    cell(strategy.data_type),
    cell(row ? `${((row.cagr || 0) * 100).toFixed(2)}%` : "—"),
    cell(row?.beta_beta == null ? "—" : row.beta_beta.toFixed(2)),
    cell(row?.sharpe == null ? "—" : row.sharpe.toFixed(2)),
    cell(row ? `${((row.max_drawdown || 0) * 100).toFixed(2)}%` : "—"),
    cell(row?.cvar95 == null ? "—" : `${((row.cvar95 || 0) * 100).toFixed(2)}%`),
  );
  return tr;
}));
