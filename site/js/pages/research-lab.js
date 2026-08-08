import { parseCsv, alignSeries, slicePeriod } from '../core/date-alignment.js';
import { calculateMetrics, formatMetric } from '../core/metrics.js';
import { listExperiments, saveExperiment, newExperiment, downloadJson } from '../core/experiment-store.js';
import { lineChart, drawdownChart } from '../charts/svg-charts.js';
import { buildPortfolioSeries, DEFAULT_ASSETS } from '../core/portfolio-engine.js';
import './lab-share.js';
import '../core/deployment-meta.js';

const $ = id => document.getElementById(id);
const catalog = await fetch('data/strategy-catalog.json').then(response => response.json());
const manifest = await fetch('data/manifest.json').then(response => response.json()).catch(() => ({}));
const data = {};
for (const strategy of catalog.strategies || []) {
  const response = await fetch(`data/backtests/${strategy.strategy_id}.csv`);
  if (response.ok) data[strategy.strategy_id] = parseCsv(await response.text()).map(row => ({ date: row.date, nav: Number(row.nav) })).filter(row => Number.isFinite(row.nav) && row.nav > 0);
}

const percent = value => value == null ? '—' : formatMetric(value);
const number = value => value == null ? '—' : formatMetric(value, 'number');
let current = null;

function renderRecent() {
  const box = $('recent'); box.replaceChildren(); const items = listExperiments();
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = '尚未保存研究實驗。'; box.append(empty); return; }
  items.forEach(item => { const row = document.createElement('div'); row.className = 'stack-item'; const name = document.createElement('strong'); name.textContent = item.name || '未命名研究實驗'; const meta = document.createElement('span'); meta.textContent = `${new Date(item.updated_at).toLocaleString('zh-TW')} · CAGR ${item.metrics?.cagr || '—'} · 最大回撤 ${item.metrics?.maxDrawdown || '—'}`; row.append(name, meta); box.append(row); });
}

function renderWeights() {
  const box = $('assetWeights'); box.replaceChildren();
  DEFAULT_ASSETS.forEach(asset => { const label = document.createElement('label'); label.className = 'stack-item'; const title = document.createElement('span'); title.textContent = asset.label; const input = document.createElement('input'); input.className = 'asset-weight'; input.dataset.asset = asset.id; input.type = 'number'; input.value = asset.weight; input.min = '0'; input.max = '100'; input.step = '5'; input.setAttribute('aria-label', `${asset.label} 權重百分比`); input.addEventListener('input', updateWeightTotal); label.append(title, input); box.append(label); });
  updateWeightTotal();
}

function updateWeightTotal() { const total = [...document.querySelectorAll('.asset-weight')].reduce((sum, input) => sum + (Number(input.value) || 0), 0); $('weightTotal').textContent = `權重合計 ${total.toFixed(1)}%；${total > 100 ? '超過 100%，目前組合引擎不接受槓桿配置。' : total < 100 ? '未配置部分將保留為現金。' : '配置完整。'}`; }

function populate() {
  catalog.strategies.forEach(strategy => { const option = document.createElement('option'); option.value = strategy.strategy_id; option.textContent = `${strategy.display_name} · ${strategy.implementation_status}`; $('strategy').append(option); });
  const custom = document.createElement('option'); custom.value = 'custom_portfolio'; custom.textContent = '自訂多資產組合 · 實驗性'; $('strategy').append(custom);
  const requested = new URLSearchParams(location.search).get('strategy'); if (requested && [...$('strategy').options].some(option => option.value === requested)) $('strategy').value = requested;
  renderWeights(); renderRecent();
}

function portfolioWeights() { return Object.fromEntries([...document.querySelectorAll('.asset-weight')].map(input => [input.dataset.asset, (Number(input.value) || 0) / 100])); }

function run() {
  const id = $('strategy').value; $('customPanel').style.display = id === 'custom_portfolio' ? 'block' : 'none';
  let rows = []; let displayName = ''; let implementationStatus = 'experimental'; let dataType = ''; let limitations = [];
  if (id === 'custom_portfolio') {
    const weights = portfolioWeights(); const portfolio = buildPortfolioSeries(data, weights, { rebalancing: $('rebalance').value, costRate: (Number($('tradeCost').value) || 0) / 100 });
    if (portfolio.invalidWeights?.length || portfolio.missingAssets?.length) { $('status').textContent = `組合無法執行：${[...(portfolio.invalidWeights || []), ...(portfolio.missingAssets || [])].join('、')}`; return; }
    rows = portfolio.rows; displayName = '自訂多資產組合'; dataType = 'actual / synthetic / cash'; limitations = ['自訂組合會依有效權重載入資料；缺少資料的非零資產會阻止運算。', '目前 Composer 不接受超過 100% 的槓桿曝險，也不支援放空。'];
  } else {
    const strategy = catalog.strategies.find(item => item.strategy_id === id); if (!strategy || !data[id]) { $('status').textContent = '此策略沒有可用回測序列。'; return; }
    const aligned = slicePeriod(alignSeries({ [id]: data[id] }, $('periodMode').value), { mode: $('period').value, startDate: $('period').value === 'custom' ? $('startDate').value : '', endDate: $('period').value === 'custom' ? $('endDate').value : '' });
    rows = aligned.rows.map(row => ({ date: row.date, nav: Number(row.values[id]?.nav) })).filter(row => Number.isFinite(row.nav)); displayName = strategy.display_name; implementationStatus = strategy.implementation_status; dataType = strategy.data_type; limitations = strategy.known_limitations || [];
  }
  if (rows.length < 2) { $('status').textContent = '有效觀測值不足，請調整研究期間或資料設定。'; return; }
  const riskFreeRate = (Number($('riskFree').value) || 0) / 100; const annualCost = (Number($('fee').value) || 0) / 100; const metrics = calculateMetrics(rows, { riskFreeRate, annualCost });
  current = { id, rows, metrics, parameters: { period: $('period').value, periodMode: $('periodMode').value, startDate: $('startDate').value, endDate: $('endDate').value, riskFreeRate, annualCost, capital: Number($('capital').value) || 0, rebalancing: $('rebalance').value, tradeCost: Number($('tradeCost').value) || 0, weights: portfolioWeights() } };
  $('strategyTitle').textContent = displayName; $('strategyStatus').textContent = implementationStatus; $('strategyStatus').className = `status ${implementationStatus === 'verified' ? 'good' : 'warn'}`;
  $('cagr').textContent = percent(metrics.cagr); $('total').textContent = percent(metrics.totalReturn); $('vol').textContent = percent(metrics.annualizedVolatility); $('sharpe').textContent = number(metrics.sharpe); $('sortino').textContent = number(metrics.sortino); $('drawdown').textContent = percent(metrics.maxDrawdown); $('duration').textContent = `${metrics.maxDrawdownDuration || 0} 個交易日`; $('wealth').textContent = formatMetric(metrics.endingWealth * current.parameters.capital, 'money');
  $('coverage').textContent = `${metrics.start} 至 ${metrics.end} · ${metrics.observations} 個觀測值 · 無風險利率 ${(riskFreeRate * 100).toFixed(2)}% · 年化成本 ${(annualCost * 100).toFixed(2)}% · 資料類型 ${dataType}`; $('dataVersion').textContent = manifest.data_end_date || '未提供'; $('modelVersion').textContent = manifest.model_version || '未提供'; $('generatedAt').textContent = new Date().toISOString(); $('warnings').textContent = limitations.filter(Boolean).join('；') || '目前沒有額外限制文字。'; $('status').textContent = `回測完成：${metrics.observations} 個觀測值。`;
  lineChart('#equity', [{ name: displayName, values: rows.map(row => ({ date: row.date, value: row.nav })) }]); drawdownChart('#dd', rows); if (current) window.dispatchEvent(new CustomEvent('prstk:experiment-updated', { detail: current }));
}

function save() { if (!current) { $('status').textContent = '請先執行回測。'; return; } const experiment = saveExperiment(newExperiment({ name: $('experimentName').value, parameters: current.parameters, metrics: { cagr: percent(current.metrics.cagr), maxDrawdown: percent(current.metrics.maxDrawdown), endingWealth: current.metrics.endingWealth }, warnings: $('warnings').textContent.split('；').filter(Boolean) })); current.experiment = experiment; renderRecent(); $('status').textContent = `已保存研究實驗：${experiment.experiment_id}`; }
function exportCsv() { if (!current) { $('status').textContent = '請先執行回測。'; return; } const lines = ['date,nav']; current.rows.forEach(row => lines.push(`${row.date},${row.nav}`)); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })); anchor.download = `${current.id}-backtest.csv`; anchor.click(); URL.revokeObjectURL(anchor.href); }

populate(); $('strategy').addEventListener('change', run); $('period').addEventListener('change', run); $('run').addEventListener('click', run); $('save').addEventListener('click', save); $('export').addEventListener('click', () => current ? downloadJson(current, `${current.id}-experiment.json`) : ($('status').textContent = '請先執行回測。')); $('exportCsv').addEventListener('click', exportCsv); $('reset').addEventListener('click', () => location.reload()); window.addEventListener('resize', () => { if (current) { lineChart('#equity', [{ values: current.rows.map(row => ({ date: row.date, value: row.nav })) }]); drawdownChart('#dd', current.rows); } }); await Promise.resolve(); run();
