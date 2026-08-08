import { parseCsv } from "./date-alignment.js";

const csvCache = new Map();
const jsonCache = new Map();

export async function loadJson(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(path, fetch(path).then((response) => {
      if (!response.ok) throw new Error(`資料載入失敗：${path}（HTTP ${response.status}）`);
      return response.json();
    }));
  }
  return jsonCache.get(path);
}

export async function loadStrategySeries(strategyId) {
  if (!csvCache.has(strategyId)) {
    const path = `data/backtests/${encodeURIComponent(strategyId)}.csv`;
    csvCache.set(strategyId, fetch(path).then(async (response) => {
      if (!response.ok) return null;
      const rows = parseCsv(await response.text())
        .map((row) => ({ date: row.date, nav: Number(row.nav) }))
        .filter((row) => Number.isFinite(row.nav) && row.nav > 0);
      return rows.length ? rows : null;
    }));
  }
  return csvCache.get(strategyId);
}
