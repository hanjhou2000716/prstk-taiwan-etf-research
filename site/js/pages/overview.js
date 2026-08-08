import { renderRiskMap } from "../charts/risk-map.js?v=20260808-home4";

const $ = (id) => document.getElementById(id);
const percent = (value) => Number.isFinite(Number(value)) ? (Number(value) * 100).toFixed(2) + "%" : "—";

try {
  const [catalog, manifest, reconciliation, baseline] = await Promise.all([
    fetch("data/strategy-catalog.json").then((response) => response.json()),
    fetch("data/manifest.json").then((response) => response.json()),
    fetch("data/reconciliation_report.json").then((response) => response.json()).catch(() => ({})),
    fetch("data/baseline_metrics.json?v=20260808-home3").then((response) => response.json()).catch(() => []),
  ]);
  const strategies = Array.isArray(catalog.strategies) ? catalog.strategies : [];
  const verified = strategies.filter((strategy) => strategy.implementation_status === "verified");
  const experimental = strategies.filter((strategy) => strategy.implementation_status !== "verified");
  $("dataDate").textContent = manifest.data_end_date || "—";
  $("modelVersion").textContent = manifest.model_version || "—";
  $("verified").textContent = String(verified.length);
  $("experimental").textContent = String(experimental.length);
  $("quality").textContent = reconciliation.formal_conclusions_blocked ? "研究結論阻擋" : "可供研究";
  $("warning").textContent = reconciliation.formal_conclusions_blocked
    ? "驗證層級尚未全部通過；請先查看資料與審核限制。"
    : "目前沒有發布阻擋。";

  const byId = Object.fromEntries((Array.isArray(baseline) ? baseline : []).map((row) => [row.strategy, row]));
  const categoryFor = (strategy) => strategy.data_type === "actual_etf"
    ? "actual_etf"
    : strategy.implementation_status === "synthetic_only"
      ? "synthetic_proxy"
      : "experimental";
  const riskRows = strategies
    .map((strategy) => ({ strategy, category: categoryFor(strategy), metrics: byId[strategy.strategy_id] }))
    .filter(({ metrics }) => metrics?.status === "available");
  const filters = [...document.querySelectorAll("[data-risk-filter]")];
  const render = () => {
    const selected = new Set(filters.filter((input) => input.checked).map((input) => input.value));
    renderRiskMap(
      $("riskMap"),
      riskRows.filter(({ category }) => selected.has(category)),
    );
  };
  filters.forEach((input) => input.addEventListener("change", render));
  render();
} catch (error) {
  $("quality").textContent = "資料載入失敗";
  $("warning").textContent = "首頁無法載入研究狀態；請稍後重試或查看 Audit。";
  $("riskMap").replaceChildren();
  const message = document.createElement("p");
  message.className = "error-state";
  message.textContent = "研究狀態暫時無法載入。";
  $("riskMap").append(message);
  console.error("Overview data load failed", error);
}
