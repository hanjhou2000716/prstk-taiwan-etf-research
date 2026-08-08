import { parseCsv } from '../core/date-alignment.js';
import { calculateMetrics, formatMetric } from '../core/metrics.js';
import { buildPortfolioSeries } from '../core/portfolio-engine.js';
import { evaluateGrid, neighborRobustness, numericRange, robustnessSummary } from '../core/robustness-engine.js';
import { heatmap } from '../charts/svg-charts.js?v=20260808-chart1';

const $ = id => document.getElementById(id);
const catalog = await fetch('data/strategy-catalog.json').then(response => response.json());
const data = {};

for (const strategy of catalog.strategies || []) {
  const response = await fetch(`data/backtests/${strategy.strategy_id}.csv`);
  if (!response.ok) continue;
  const rows = parseCsv(await response.text()).map(row => ({ date: row.date, nav: Number(row.nav) })).filter(row => Number.isFinite(row.nav) && row.nav > 0);
  if (rows.length > 1) data[strategy.strategy_id] = rows;
}

const strategies = catalog.strategies.filter(strategy => data[strategy.strategy_id]);
strategies.forEach(strategy => {
  const option = document.createElement('option');
  option.value = strategy.strategy_id;
  option.textContent = strategy.display_name;
  $('strategy').append(option);
});

const metricDefinitions = {
  cagr: { label: 'CAGR', format: value => formatMetric(value) },
  sharpe: { label: 'Sharpe', format: value => formatMetric(value, 'number') },
  maxDrawdown: { label: '最大回撤', format: value => formatMetric(value) },
  annualizedVolatility: { label: '年化波動率', format: value => formatMetric(value) },
  totalReturn: { label: '總報酬', format: value => formatMetric(value) },
};

function buildGrid() {
  const asset = $('strategy').value;
  const weights = numericRange({ start: 0, end: 1, step: 0.1 });
  const costs = numericRange({ start: 0, end: 0.01, step: 0.0025 });
  const riskFreeRate = Number($('riskFree').value || 0) / 100;
  const metric = $('metric').value;
  const grid = evaluateGrid(weights, costs, ({ x: weight, y: cost }) => {
    const portfolio = buildPortfolioSeries({ [asset]: data[asset] }, { [asset]: weight, cash: 1 - weight }, {
      rebalancing: $('rebalance').value,
      costRate: cost,
      cashYield: Number($('cashYield').value || 0) / 100,
    });
    if (portfolio.rows.length < 2) return null;
    return calculateMetrics(portfolio.rows, { riskFreeRate })[metric];
  });
  return { grid, weights, costs, metric };
}

function renderSummary(grid, metric) {
  const summary = robustnessSummary(grid);
  const neighbors = neighborRobustness(grid);
  if (summary.status === 'unavailable') {
    $('status').textContent = '目前設定沒有足夠的有效回測結果，請檢查資料期間與策略。';
    return;
  }
  const definition = metricDefinitions[metric];
  const best = grid.best ? `${(grid.best.x * 100).toFixed(0)}% 權重、${(grid.best.y * 10000).toFixed(1)} bps 成本，${definition.label} ${definition.format(grid.best.value)}` : '無';
  const warning = summary.potentialCurveFitting ? '鄰近參數沒有形成穩定區域，可能存在參數敏感或曲線配適風險。' : '最佳點周邊仍有可觀測的穩定區域，請搭配樣本外驗證解讀。';
  $('status').innerHTML = `<strong>${definition.label} 敏感度</strong>　有效格數 ${summary.validCount}　中位數 ${definition.format(summary.median)}<br>最佳格：${best}<br><span class="status ${summary.potentialCurveFitting ? 'warn' : 'good'}">${warning}</span>${neighbors.average == null ? '' : `<br>最佳點與鄰近格平均差距：${definition.format(neighbors.gapToBest)}`}`;
}

function render() {
  const { grid, weights, costs, metric } = buildGrid();
  renderSummary(grid, metric);
  heatmap('#heatmap', grid.matrix.map(row => row.map(value => value == null ? null : value)), {
    labels: costs.map(cost => `${(cost * 10000).toFixed(1)} bps`),
    columns: weights.map(weight => `${(weight * 100).toFixed(0)}%`),
    height: 360,
  });
  const definition = metricDefinitions[metric];
  $('heatmapTitle').textContent = `${definition.label}：資產權重 × 交易成本`;
  $('gridNote').textContent = `X 軸為 ${$('strategy').selectedOptions[0]?.textContent || $('strategy').value} 的配置權重；Y 軸為單次換手成本假設。空白格代表資料不足或模型未產生有效結果，不代表零報酬。`;
}

$('run').addEventListener('click', render);
$('strategy').addEventListener('change', render);
$('metric').addEventListener('change', render);
render();
