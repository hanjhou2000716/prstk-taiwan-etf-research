import { parseCsv } from '../core/date-alignment.js';
import { buildPortfolioSeries } from '../core/portfolio-engine.js';
import { calculateMetrics, formatMetric } from '../core/metrics.js';
import { lineChart } from '../charts/svg-charts.js';
import { aggregateWeights } from '../core/weight-input.js';

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

const assets = catalog.strategies.filter(strategy => data[strategy.strategy_id]);

function clearResults() {
  ['cagr', 'drawdown', 'turnover', 'ending'].forEach(id => { $(id).textContent = '—'; });
}

function addAsset() {
  const rowCount = document.querySelectorAll('.composer-row').length;
  if (rowCount >= 10) return;

  const row = document.createElement('div');
  row.className = 'composer-row';

  const select = document.createElement('select');
  select.setAttribute('aria-label', '資產');
  assets.forEach(asset => {
    const option = document.createElement('option');
    option.value = asset.strategy_id;
    option.textContent = asset.display_name;
    select.append(option);
  });

  const weight = document.createElement('input');
  weight.type = 'number';
  weight.value = rowCount === 0 ? '50' : '0';
  weight.min = '0';
  weight.max = '100';
  weight.step = '5';
  weight.setAttribute('aria-label', '權重百分比');
  row.append(select, weight);
  $('assets').append(row);
}

function run() {
  const weights = aggregateWeights([...document.querySelectorAll('.composer-row')].map(row => ({
    id: row.querySelector('select').value,
    weight: (Number(row.querySelector('input').value) || 0) / 100,
  })));
  weights.cash = (Number($('cash').value) || 0) / 100;

  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  $('weightTotal').textContent = `權重合計 ${ (total * 100).toFixed(1) }% · ${
    total < 1 ? '不足部分自動視為現金' : total > 1 ? '超過 100%，目前需接入融資模型' : '配置完整'
  }`;

  const activeAssets = Object.entries(weights).filter(([id, weight]) => id !== 'cash' && weight > 0);
  if (!activeAssets.length) {
    clearResults();
    $('status').textContent = '請至少配置一個非零權重資產後再執行回測。';
    return;
  }

  let result;
  try {
    result = buildPortfolioSeries(data, weights, {
      cashYield: (Number($('cashYield').value) || 0) / 100,
      rebalancing: $('rebalance').value,
      costRate: (Number($('cost').value) || 0) / 10000,
      rebalanceBand: (Number($('band').value) || 0) / 100,
    });
  } catch (error) {
    clearResults();
    $('status').textContent = `回測失敗：${error instanceof Error ? error.message : '未知錯誤'}`;
    return;
  }

  if (result.missingAssets?.length) {
    clearResults();
    $('status').textContent = `資料不足：${result.missingAssets.join('、')}`;
    return;
  }
  if (result.invalidWeights?.length) {
    clearResults();
    $('status').textContent = `參數無法執行：${result.invalidWeights.join('、')}`;
    return;
  }
  if (!result.rows?.length) {
    clearResults();
    $('status').textContent = '目前配置沒有足夠的共同交易日可供回測。';
    return;
  }

  const metrics = calculateMetrics(result.rows);
  const eventCount = result.ledger?.length ?? 0;
  $('status').textContent = `${metrics.start} 至 ${metrics.end} · ${metrics.observations} 個交易日 · 再平衡 ${result.rows.filter(row => row.rebalanced).length} 次 · 交易事件 ${eventCount} 筆`;
  $('cagr').textContent = formatMetric(metrics.cagr, 'percent');
  $('drawdown').textContent = formatMetric(metrics.maxDrawdown, 'percent');
  $('turnover').textContent = formatMetric(result.rows.reduce((sum, row) => sum + row.turnover, 0), 'money');
  $('ending').textContent = formatMetric(metrics.endingWealth, 'number');
  lineChart('#composerChart', [{ name: 'Portfolio NAV', values: result.rows.map(row => ({ value: row.nav })) }]);
}

addAsset();
addAsset();
$('add').addEventListener('click', addAsset);
$('run').addEventListener('click', run);
run();
