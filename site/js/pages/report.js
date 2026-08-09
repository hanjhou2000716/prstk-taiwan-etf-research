import { parseCsv } from '../core/date-alignment.js';
import { calculateMetrics, formatMetric, monthlyReturns, returnDistribution } from '../core/metrics.js';
import { lineChart, drawdownChart, heatmap } from '../charts/svg-charts.js?v=20260808-chart1';
import './horizon-panel.js';
import './report-evidence.js';
import '../core/deployment-meta.js';

const [catalog, manifest, reconciliation] = await Promise.all([
  fetch('data/strategy-catalog.json').then(response => response.json()),
  fetch('data/manifest.json').then(response => response.json()),
  fetch('data/reconciliation_report.json').then(response => response.json()).catch(() => ({ status: 'unavailable' })),
]);
const data = {};
for (const strategy of catalog.strategies) {
  const response = await fetch(`data/backtests/${strategy.strategy_id}.csv`);
  if (!response.ok) continue;
  data[strategy.strategy_id] = parseCsv(await response.text())
    .map(row => ({ date: row.date, nav: Number(row.nav) }))
    .filter(row => Number.isFinite(row.nav));
}
const rows = Object.entries(data).filter(([, series]) => series.length > 1);
const percent = value => formatMetric(value, 'percent');
const statusLabel = status => ({ verified: 'Verified', experimental: '實驗性', synthetic_only: 'Synthetic Only' }[status] || '部分實作');

document.querySelector('#dataDate').textContent = manifest.data_end_date || '—';
document.querySelector('#modelVersion').textContent = manifest.model_version || '—';
document.querySelector('#verified').textContent = catalog.strategies.filter(strategy => strategy.implementation_status === 'verified').length;
document.querySelector('#quality').textContent = reconciliation.formal_conclusions_blocked ? '研究結論阻擋' : '可供研究';
document.querySelector('#reportMeta').textContent = `生成於 ${new Date().toLocaleDateString('zh-TW')} · 無風險利率 0.00%`;
document.querySelector('#metrics').innerHTML = rows.map(([id, series]) => {
  const strategy = catalog.strategies.find(item => item.strategy_id === id);
  const metrics = calculateMetrics(series);
  const distribution = returnDistribution(series);
  return `<tr><td>${strategy?.display_name || id}</td><td>${statusLabel(strategy?.implementation_status)}</td><td>${percent(metrics.cagr)}</td><td>${percent(metrics.totalReturn)}</td><td>${percent(metrics.annualizedVolatility)}</td><td>${metrics.sharpe == null ? '—' : metrics.sharpe.toFixed(2)}</td><td>${metrics.sortino == null ? '—' : metrics.sortino.toFixed(2)}</td><td>${percent(metrics.maxDrawdown)}</td><td>${percent(distribution.cvar95)}</td></tr>`;
}).join('');
document.querySelector('#metrics').closest('table').querySelector('thead tr').insertAdjacentHTML('beforeend', '<th>CVaR 95%</th>');

// Render catalog-controlled values as text nodes. This keeps report exports and
// the visible table safe even when a future data catalog contains markup-like text.
const metricsBody = document.querySelector('#metrics');
metricsBody.replaceChildren(...rows.map(([id, series]) => {
  const strategy = catalog.strategies.find(item => item.strategy_id === id);
  const metrics = calculateMetrics(series);
  const distribution = returnDistribution(series);
  const values = [
    strategy?.display_name || id,
    statusLabel(strategy?.implementation_status),
    percent(metrics.cagr),
    percent(metrics.totalReturn),
    percent(metrics.annualizedVolatility),
    metrics.sharpe == null ? '—' : metrics.sharpe.toFixed(2),
    metrics.sortino == null ? '—' : metrics.sortino.toFixed(2),
    percent(metrics.maxDrawdown),
    percent(distribution.cvar95),
  ];
  const row = document.createElement('tr');
  values.forEach(value => {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.append(cell);
  });
  return row;
}));

const controls = document.createElement('div');
controls.className = 'toolbar';
controls.style.marginTop = '18px';
controls.innerHTML = '<label class="chip">圖表策略 <select id="reportStrategy" style="border:0;background:transparent;color:inherit"><option value="all">全部可用策略</option></select></label><button class="button secondary" id="exportReportJson">匯出 JSON</button><button class="button secondary" id="exportReportCsv">匯出 CSV</button><button class="button secondary" id="printReport">列印／PDF</button>';
document.querySelector('.hero').append(controls);
const selector = controls.querySelector('#reportStrategy');
rows.forEach(([id]) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = catalog.strategies.find(strategy => strategy.strategy_id === id)?.short_name || id;
  selector.append(option);
});

const extra = document.createElement('section');
extra.className = 'section';
extra.innerHTML = '<div class="section-title"><h2>月度報酬與報酬分布</h2><p>可切換策略；缺少月份保留為空白，不視為 0% 報酬。</p></div><div class="chart-grid"><div class="chart-panel"><div class="section-title"><h2>月度報酬熱力圖</h2><p>列為年度、欄為月份</p></div><div id="monthlyHeatmap" class="chart chart-svg"></div></div><div class="card"><div class="section-title"><h2>報酬分布摘要</h2><p id="distributionName">—</p></div><div id="distribution" class="metric-grid"></div></div></div>';
document.querySelector('main').insertBefore(extra, document.querySelector('footer'));

function selectedRows() {
  return selector.value === 'all' ? rows : rows.filter(([id]) => id === selector.value);
}

function renderCharts() {
  const selected = selectedRows();
  if (!selected.length) return;
  lineChart('#equity', selected.map(([id, series]) => ({ name: id, type: 'strategy-nav', unit: 'nav', values: series.map(row => ({ date: row.date, value: row.nav })) })), { capabilities: { logScale: false, table: true, range: true } });
  drawdownChart('#drawdown', selected[0][1]);
  const series = selected[0][1];
  const months = monthlyReturns(series);
  const years = [...new Set(months.map(row => row.month.slice(0, 4)))];
  const byMonth = new Map(months.map(row => [row.month, row.return]));
  const matrix = years.map(year => Array.from({ length: 12 }, (_, index) => byMonth.get(`${year}-${String(index + 1).padStart(2, '0')}`) ?? null));
  heatmap('#monthlyHeatmap', matrix, { labels: years, columns: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'], height: Math.max(240, years.length * 28) });
  const distribution = returnDistribution(series);
  document.querySelector('#distributionName').textContent = catalog.strategies.find(strategy => strategy.strategy_id === selected[0][0])?.display_name || selected[0][0];
  document.querySelector('#distribution').innerHTML = [
    ['平均日報酬', percent(distribution.mean)], ['中位數', percent(distribution.median)],
    ['5% 分位數', percent(distribution.p05)], ['95% 分位數', percent(distribution.p95)],
    ['VaR 95%', percent(distribution.var95)], ['CVaR 95%', percent(distribution.cvar95)],
  ].map(([label, value]) => `<div class="metric"><small>${label}</small><strong>${value}</strong></div>`).join('');
}

function download(content, name, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

controls.querySelector('#exportReportJson').addEventListener('click', () => download(JSON.stringify({ generated_at: new Date().toISOString(), manifest, catalog, reconciliation, metrics: rows.map(([id, series]) => ({ strategy: id, ...calculateMetrics(series) })) }, null, 2), 'prstk-report.json', 'application/json'));
controls.querySelector('#exportReportCsv').addEventListener('click', () => download(`strategy,cagr,total_return,volatility,sharpe,sortino,max_drawdown,cvar95\n${rows.map(([id, series]) => { const metrics = calculateMetrics(series); return [id, metrics.cagr, metrics.totalReturn, metrics.annualizedVolatility, metrics.sharpe, metrics.sortino, metrics.maxDrawdown, metrics.cvar95].join(','); }).join('\n')}`, 'prstk-report.csv', 'text/csv;charset=utf-8'));
controls.querySelector('#printReport').addEventListener('click', () => window.print());
selector.addEventListener('change', renderCharts);
renderCharts();
