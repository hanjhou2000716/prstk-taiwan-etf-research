const [catalog, horizons] = await Promise.all([
  fetch("data/strategy-catalog.json").then((response) => response.json()),
  fetch("data/horizon_metrics.json").then((response) => response.json()),
]);
const names = Object.fromEntries(catalog.strategies.map((strategy) => [strategy.strategy_id, strategy.display_name]));
const percent = (value) => value == null ? "—" : `${(value * 100).toFixed(2)}%`;
const section = document.createElement("section");
section.className = "section";
section.innerHTML = `
  <div class="section-title"><h2>長期回測視窗</h2><p>20／10／5／3／1 年；不同起始日不可直接視為同樣本比較</p></div>
  <div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">策略</th><th scope="col">視窗</th><th scope="col">資料類型</th><th scope="col">起始日</th><th scope="col">CAGR</th><th scope="col">累積報酬</th><th scope="col">最大回撤</th><th scope="col">狀態／限制</th></tr></thead><tbody id="horizonRows"></tbody></table></div>
  <div class="toolbar"><button class="button secondary" id="exportHorizon">匯出 Horizon JSON</button></div>`;
document.querySelector("main").insertBefore(section, document.querySelector("footer"));

const cell = (text, tag = "td") => { const node = document.createElement(tag); node.textContent = text; return node; };
const body = section.querySelector("#horizonRows");
body.replaceChildren(...horizons.map((item) => {
  const available = item.status === "available";
  const synthetic = item.data_type === "synthetic_2x_proxy";
  const row = document.createElement("tr");
  const status = cell(available ? (synthetic ? "Synthetic Proxy" : "Actual ETF") : "不可用");
  status.className = `status ${available ? (synthetic ? "warn" : "good") : ""}`;
  row.append(
    cell(names[item.strategy] || item.strategy),
    cell(`${item.horizon_years} 年`),
    status,
    cell(item.start || "—"),
    cell(available ? percent(item.annualized_return) : "—"),
    cell(available ? percent(item.total_return) : "—"),
    cell(available ? percent(item.max_drawdown) : "—"),
    cell(available ? (item.proxy_basis || "可用資料") : (item.reason || "資料不足")),
  );
  return row;
}));

section.querySelector("#exportHorizon").addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify({ generated_at: new Date().toISOString(), horizons }, null, 2)], { type: "application/json" }));
  link.download = "prstk-horizon-metrics.json";
  link.click();
  URL.revokeObjectURL(link.href);
});
