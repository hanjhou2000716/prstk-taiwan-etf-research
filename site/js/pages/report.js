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
const statusLabel = status => ({
  verified: '已驗證',
  experimental: '實驗性',
  synthetic_only: '僅合成資料',
  partially_implemented: '部分實作',
}[status] || '待驗證');
const strategyFor = id => catalog.strategies.find(strategy => strategy.strategy_id === id);
const el = selector => document.querySelector(selector);

el('#dataDate').textContent = manifest.data_end_date || '未提供';
el('#modelVersion').textContent = manifest.model_version || '未提供';
el('#verified').textContent = catalog.strategies.filter(strategy => strategy.implementation_status === 'verified').length;
el('#quality').textContent = reconciliation.formal_conclusions_blocked ? '研究結論暫停發布' : '資料檢核完成';
el('#reportMeta').textContent = `報告產生於 ${new Date().toLocaleDateString('zh-TW')}；所有數字以資料與模型版本為準。`;

function metricCell(value) {
  const cell = document.createElement('td');
  cell.textContent = String(value);
  return cell;
}

function renderMetricTable() {
  const metricsBody = document.querySelector('#metrics');
  const body = metricsBody;
  const header = body.closest('table').querySelector('thead tr');
  if (!header.querySelector('[data-cvar-column]')) {
    const cvarHeader = document.createElement('th');
    cvarHeader.scope = 'col';
    cvarHeader.dataset.cvarColumn = 'true';
    cvarHeader.textContent = 'CVaR 95%';
    header.append(cvarHeader);
  }
  metricsBody.replaceChildren(...rows.map(([id, series]) => {
    const strategy = strategyFor(id);
    const metrics = calculateMetrics(series);
    const distribution = returnDistribution(series);
    const row = document.createElement('tr');
    [
      strategy?.display_name || id,
      statusLabel(strategy?.implementation_status),
      percent(metrics.cagr),
      percent(metrics.totalReturn),
      percent(metrics.annualizedVolatility),
      metrics.sharpe == null ? '—' : metrics.sharpe.toFixed(2),
      metrics.sortino == null ? '—' : metrics.sortino.toFixed(2),
      percent(metrics.maxDrawdown),
      percent(distribution.cvar95),
    ].forEach(value => row.append(metricCell(value)));
    return row;
  }));
}

function button(label, id) {
  const item = document.createElement('button');
  item.className = 'button secondary';
  item.id = id;
  item.type = 'button';
  item.textContent = label;
  return item;
}

const controls = document.createElement('div');
controls.className = 'toolbar';
controls.style.marginTop = '18px';
const label = document.createElement('label');
label.className = 'chip';
label.textContent = '圖表策略 ';
const selector = document.createElement('select');
selector.id = 'reportStrategy';
selector.setAttribute('aria-label', '選擇報告策略');
const allOption = document.createElement('option');
allOption.value = 'all';
allOption.textContent = '全部可用策略';
selector.append(allOption);
rows.forEach(([id]) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = strategyFor(id)?.short_name || id;
  selector.append(option);
});
label.append(selector);
controls.append(label, button('匯出 JSON', 'exportReportJson'), button('匯出 CSV', 'exportReportCsv'), button('列印／PDF', 'printReport'));
el('.hero').append(controls);

const extra = document.createElement('section');
extra.className = 'section';
extra.innerHTML = '<div class="section-title"><h2>月度報酬與報酬分布</h2><p>缺少月份保留為空白，不視為零報酬。</p></div><div class="chart-grid"><div class="chart-panel"><div class="section-title"><h2>月度報酬熱力圖</h2><p>列為年度、欄為月份</p></div><div id="monthlyHeatmap" class="chart chart-svg"></div></div><div class="card"><div class="section-title"><h2>報酬分布摘要</h2><p id="distributionName">—</p></div><div id="distribution" class="metric-grid"></div></div></div>';
document.querySelector('main').insertBefore(extra, document.querySelector('footer'));

function selectedRows() {
  return selector.value === 'all' ? rows : rows.filter(([id]) => id === selector.value);
}

function renderDistribution(distribution) {
  const target = el('#distribution');
  const values = [
    ['平均日報酬', distribution.mean], ['中位數日報酬', distribution.median],
    ['5% 分位數', distribution.p05], ['95% 分位數', distribution.p95],
    ['VaR 95%', distribution.var95], ['CVaR 95%', distribution.cvar95],
  ];
  target.replaceChildren(...values.map(([name, value]) => {
    const metric = document.createElement('div');
    metric.className = 'metric';
    const title = document.createElement('small');
    title.textContent = name;
    const content = document.createElement('strong');
    content.textContent = percent(value);
    metric.append(title, content);
    return metric;
  }));
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
  heatmap('#monthlyHeatmap', matrix, { labels: years, columns: Array.from({ length: 12 }, (_, index) => `${index + 1}月`), height: Math.max(240, years.length * 28) });
  el('#distributionName').textContent = strategyFor(selected[0][0])?.display_name || selected[0][0];
  renderDistribution(returnDistribution(series));
}

function download(content, name, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

el('#exportReportJson').addEventListener('click', () => download(JSON.stringify({ generated_at: new Date().toISOString(), manifest, catalog, reconciliation, metrics: rows.map(([id, series]) => ({ strategy: id, ...calculateMetrics(series) })) }, null, 2), 'prstk-report.json', 'application/json'));
el('#exportReportCsv').addEventListener('click', () => download(`strategy,cagr,total_return,volatility,sharpe,sortino,max_drawdown,cvar95\n${rows.map(([id, series]) => { const metrics = calculateMetrics(series); return [id, metrics.cagr, metrics.totalReturn, metrics.annualizedVolatility, metrics.sharpe, metrics.sortino, metrics.maxDrawdown, metrics.cvar95].join(','); }).join('\n')}`, 'prstk-report.csv', 'text/csv;charset=utf-8'));
el('#printReport').addEventListener('click', () => window.print());
selector.addEventListener('change', renderCharts);
renderMetricTable();
renderCharts();
