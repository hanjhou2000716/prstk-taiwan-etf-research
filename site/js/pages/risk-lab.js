import { parseCsv } from '../core/date-alignment.js';
import { calculateMetrics, drawdownEpisodes, formatMetric } from '../core/metrics.js';
import { rollingRisk, crisisMetrics } from '../core/risk-engine.js';
import { lineChart } from '../charts/svg-charts.js?v=20260808-chart1';

const $ = id => document.getElementById(id);
const catalog = await fetch('data/strategy-catalog.json').then(response => response.json());
const data = {};
for (const strategy of catalog.strategies) {
  const response = await fetch(`data/backtests/${strategy.strategy_id}.csv`);
  if (!response.ok) continue;
  data[strategy.strategy_id] = parseCsv(await response.text())
    .map(row => ({ date: row.date, nav: Number(row.nav) }))
    .filter(row => Number.isFinite(row.nav));
}
const pct = value => value == null ? '—' : formatMetric(value, 'percent');

function populate() {
  catalog.strategies.filter(strategy => data[strategy.strategy_id]?.length > 1).forEach(strategy => {
    const option = document.createElement('option');
    option.value = strategy.strategy_id;
    option.textContent = `${strategy.display_name} · ${strategy.data_type}`;
    $('strategy').append(option);
  });
}

function render() {
  const rows = data[$('strategy').value] || [];
  const metrics = calculateMetrics(rows);
  const window = Number($('window').value) || 252;
  const rolling = rollingRisk(rows, window);
  const episodes = drawdownEpisodes(rows);
  const crisis = crisisMetrics(rows, $('crisisStart').value, $('crisisEnd').value);
  $('status').textContent = rows.length > 1
    ? `${metrics.start} 至 ${metrics.end} · ${metrics.observations} 個交易日 · 滾動視窗 ${window} 日`
    : '資料不足：沒有足夠的有效 NAV 觀測值。';
  $('cagr').textContent = pct(metrics.cagr);
  $('volatility').textContent = pct(metrics.annualizedVolatility);
  $('drawdown').textContent = pct(metrics.maxDrawdown);
  $('cvar').textContent = pct(metrics.cvar95);
  $('crisisReturn').textContent = pct(crisis.return);
  $('crisisDrawdown').textContent = pct(crisis.maxDrawdown);
  $('crisisVol').textContent = pct(crisis.volatility);
  lineChart('#rolling', [
    { name: 'Rolling CAGR', values: rolling.map(row => ({ value: row.cagr })) },
    { name: 'Rolling Volatility', values: rolling.map(row => ({ value: row.volatility })) },
  ], { percent: true });
  $('episodes').replaceChildren(...episodes.slice(0, 10).map((event, index) => {
    const item = document.createElement('div');
    item.className = 'stack-item';
    item.textContent = `#${index + 1} ${event.peak} → ${event.trough} · ${pct(event.drawdown)} · 水下 ${event.underwaterDays} 個交易日 · ${event.recovery || '尚未恢復'}`;
    return item;
  }));
}

populate();
$('strategy').addEventListener('change', render);
$('window').addEventListener('change', render);
$('runCrisis').addEventListener('click', render);
render();
