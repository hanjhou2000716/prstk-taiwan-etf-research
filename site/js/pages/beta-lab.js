import { parseCsv } from '../core/date-alignment.js';
import { calculateMetrics, formatMetric } from '../core/metrics.js';
import { calculateBetaMetrics, rollingBeta } from '../core/beta-engine.js';
import { lineChart } from '../charts/svg-charts.js';

const $ = id => document.getElementById(id);
const catalog = await fetch('data/strategy-catalog.json').then(response => response.json());
const manifest = await fetch('data/manifest.json').then(response => response.json()).catch(() => ({}));
const data = {};
for (const strategy of catalog.strategies || []) {
  const response = await fetch(`data/backtests/${strategy.strategy_id}.csv`);
  if (response.ok) data[strategy.strategy_id] = parseCsv(await response.text()).map(row => ({ date: row.date, nav: Number(row.nav) })).filter(row => Number.isFinite(row.nav) && row.nav > 0);
}
const number = value => value == null ? '—' : formatMetric(value, 'number');
const percent = value => value == null ? '—' : formatMetric(value);

catalog.strategies.filter(strategy => data[strategy.strategy_id]?.length > 1).forEach(strategy => {
  const option = document.createElement('option'); option.value = strategy.strategy_id; option.textContent = strategy.display_name; $('strategy').append(option);
});
$('benchmark').innerHTML = '<option value="buy_hold_006208">006208</option><option value="buy_hold_00685L">00685L</option><option value="buy_hold_00631L">00631L</option>';

function render() {
  const rows = data[$('strategy').value] || []; const benchmark = data[$('benchmark').value] || []; const riskFreeRate = (Number($('riskFree').value) || 0) / 100;
  const beta = calculateBetaMetrics(rows, benchmark, { riskFreeRate }); const metrics = calculateMetrics(rows, { benchmarkRows: benchmark, riskFreeRate });
  $('status').textContent = beta.status === 'available' ? `共同期間：${beta.start} 至 ${beta.end}，${beta.observations} 個觀測值。` : `資料不足：${beta.reason}`;
  $('beta').textContent = number(beta.beta); $('alpha').textContent = percent(beta.alpha); $('r2').textContent = percent(beta.rSquared); $('correlation').textContent = number(beta.correlation); $('tracking').textContent = percent(beta.trackingError); $('informationRatio').textContent = number(beta.informationRatio); $('upCapture').textContent = percent(beta.upCapture); $('downCapture').textContent = percent(beta.downCapture); $('cagr').textContent = percent(metrics.cagr); $('drawdown').textContent = percent(metrics.maxDrawdown);
  const rolling = rollingBeta(rows, benchmark, Number($('window').value) || 60);
  lineChart('#rolling', [{ name: 'Rolling Beta', values: rolling.map(point => ({ date: point.date, value: point.value })) }], { percent: false });
  $('coverage').textContent = `資料截止日：${manifest.data_end_date || '未提供'}；Actual 與 Synthetic 仍依策略目錄分開解讀。`;
}

['run', 'strategy', 'benchmark', 'window', 'riskFree'].forEach(id => $(id).addEventListener(id === 'run' ? 'click' : 'change', render));
render();
