const [catalog, metrics] = await Promise.all([
  fetch("data/strategy-catalog.json").then((response) => response.json()),
  fetch("data/baseline_metrics.json").then((response) => response.json()),
]);

const byId = Object.fromEntries(metrics.map((row) => [row.strategy, row]));
const section = document.createElement("section");
section.className = "section";
section.innerHTML = `
  <div class="section-title">
    <h2>策略研究評分卡</h2>
    <p>研究排序提示，不是投資建議；Actual 與 Synthetic 分組，不跨組排名。</p>
  </div>
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr><th scope="col">策略</th><th scope="col">資料類型</th><th scope="col">報酬</th><th scope="col">風險控制</th><th scope="col">Sharpe</th><th scope="col">最大回撤</th><th scope="col">研究分數</th><th scope="col">說明</th></tr></thead>
      <tbody id="scorecardBody"></tbody>
    </table>
  </div>`;
document.querySelector("main").insertBefore(section, document.querySelector(".footer"));

function score(row) {
  if (!row) return null;
  const returnScore = Math.max(0, Math.min(1, (row.cagr || 0) / 0.2));
  const riskScore = Math.max(0, Math.min(1, 1 - Math.abs(row.max_drawdown || 1)));
  const sharpeScore = Math.max(0, Math.min(1, ((row.sharpe || 0) + 1) / 3));
  return 0.4 * returnScore + 0.35 * riskScore + 0.25 * sharpeScore;
}

function cell(text, tag = "td") {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function appendRow(strategy) {
  const row = byId[strategy.strategy_id];
  const value = score(row);
  const tr = document.createElement("tr");
  tr.append(
    cell(strategy.display_name),
    cell(strategy.data_type),
    cell(row ? `${((row.cagr || 0) * 100).toFixed(2)}%` : "—"),
    cell(row ? `${((1 - Math.abs(row.max_drawdown || 1)) * 100).toFixed(2)}%` : "—"),
    cell(row?.sharpe == null ? "—" : row.sharpe.toFixed(2)),
    cell(row ? `${((row.max_drawdown || 0) * 100).toFixed(2)}%` : "—"),
    cell(value == null ? "—" : (value * 100).toFixed(1)),
    cell(strategy.implementation_status === "verified" ? "可進入正式比較" : "實驗／合成；不自動推薦"),
  );
  return tr;
}

const body = section.querySelector("#scorecardBody");
for (const [group, strategies] of Object.entries({
  actual: catalog.strategies.filter((strategy) => strategy.data_type === "actual_etf"),
  synthetic: catalog.strategies.filter((strategy) => strategy.data_type !== "actual_etf"),
})) {
  const heading = document.createElement("tr");
  const label = document.createElement("th");
  label.scope = "rowgroup";
  label.colSpan = 8;
  label.textContent = `${group === "actual" ? "Actual ETF" : "Synthetic／模型假設"} 分組 · 不跨組排名`;
  heading.append(label);
  body.append(heading, ...strategies.map(appendRow));
}
