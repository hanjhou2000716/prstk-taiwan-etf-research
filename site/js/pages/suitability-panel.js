import { evaluateSuitability } from "../core/suitability-engine.js";

const [catalog, baseline] = await Promise.all([
  fetch("data/strategy-catalog.json").then((response) => response.json()),
  fetch("data/baseline_metrics.json").then((response) => response.json()),
]);
const byId = Object.fromEntries(baseline.map((row) => [row.strategy, row]));
const section = document.createElement("section");
section.className = "section";
section.innerHTML = `
  <div class="section-title">
    <h2>研究適配矩陣</h2>
    <p>以使用者限制篩選歷史模型結果；不是個人化投資建議。</p>
  </div>
  <div class="toolbar">
    <label class="chip">最大可接受回撤
      <select id="fitMaxDrawdown"><option value="0.2">20%</option><option value="0.35" selected>35%</option><option value="0.6">60%</option></select>
    </label>
    <label class="chip"><input id="fitLeverage" type="checkbox" checked> 接受槓桿</label>
    <label class="chip"><input id="fitPledge" type="checkbox"> 接受質押</label>
    <label class="chip"><input id="fitExperimental" type="checkbox"> 納入實驗策略</label>
  </div>
  <div class="table-wrap" style="margin-top:16px">
    <table class="data-table"><thead><tr><th scope="col">策略</th><th scope="col">適配結果</th><th scope="col">研究分數</th><th scope="col">最大回撤</th><th scope="col">限制與理由</th><th scope="col">實作狀態</th></tr></thead><tbody id="suitabilityBody"></tbody></table>
  </div>
  <div class="note" style="margin-top:16px">分數由歷史報酬、回撤、CVaR、恢復時間與研究限制組成；任何外部券商資格與未來報酬仍需另行確認。</div>`;
document.querySelector("main").insertBefore(section, document.querySelector(".footer"));

const body = section.querySelector("#suitabilityBody");
const percent = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(2)}%` : "—";
const cell = (text) => { const node = document.createElement("td"); node.textContent = text; return node; };

function render() {
  const constraints = {
    maxDrawdown: Number(section.querySelector("#fitMaxDrawdown").value),
    acceptLeverage: section.querySelector("#fitLeverage").checked,
    acceptPledge: section.querySelector("#fitPledge").checked,
    includeExperimental: section.querySelector("#fitExperimental").checked,
  };
  body.replaceChildren(...catalog.strategies.map((strategy) => {
    const metrics = byId[strategy.strategy_id];
    const result = evaluateSuitability(strategy, metrics, constraints);
    const reasons = [...result.hard_failures, ...result.reasons];
    const row = document.createElement("tr");
    row.append(
      cell(strategy.display_name),
      cell(result.status === "excluded" ? "排除" : "研究適配"),
      cell(result.status === "excluded" ? "—" : (result.score * 100).toFixed(1)),
      cell(percent(metrics?.max_drawdown)),
      cell(reasons.join("；") || "目前限制內無額外警示"),
      cell(strategy.implementation_status),
    );
    return row;
  }));
}

section.querySelectorAll("input, select").forEach((control) => control.addEventListener("change", render));
render();
