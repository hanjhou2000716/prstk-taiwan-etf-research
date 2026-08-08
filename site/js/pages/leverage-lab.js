import { parseCsv } from '../core/date-alignment.js';
import { formatMetric } from '../core/metrics.js';
import { leverageComparison, volatilityDragModel } from '../core/leverage-engine.js';
import { lineChart } from '../charts/svg-charts.js';

const $ = id => document.getElementById(id);
const catalog = await fetch('data/strategy-catalog.json').then(response => response.json());
const data = {};
for (const strategy of catalog.strategies || []) {
  const response = await fetch(`data/backtests/${strategy.strategy_id}.csv`);
  if (response.ok) data[strategy.strategy_id] = parseCsv(await response.text()).map(row => ({ date: row.date, nav: Number(row.nav) })).filter(row => Number.isFinite(row.nav) && row.nav > 0);
}
const percent = value => value == null ? '—' : formatMetric(value);
const number = value => value == null ? '—' : formatMetric(value, 'number');

catalog.strategies.filter(strategy => data[strategy.strategy_id]?.length > 1).forEach(strategy => {
  const option = document.createElement('option'); option.value = strategy.strategy_id; option.textContent = strategy.display_name; $('actual').append(option);
});
$('underlying').innerHTML = '<option value="buy_hold_006208">006208</option><option value="buy_hold_00685L">00685L</option><option value="buy_hold_00631L">00631L</option>';

function renderComparison() {
  const underlying = data[$('underlying').value] || []; const actual = data[$('actual').value] || []; const leverage = Number($('leverage').value) || 2; const result = leverageComparison(underlying, actual, leverage);
  $('status').textContent = result.status === 'available' ? `共同期間：${result.start} 至 ${result.end}，${result.observations} 個觀測值。` : `資料不足：${result.reason}`;
  $('actualReturn').textContent = percent(result.actualReturn); $('theoreticalReturn').textContent = percent(result.theoreticalReturn); $('gap').textContent = percent(result.leverageGap); $('capture').textContent = number(result.leverageCaptureRatio); $('compounding').textContent = percent(result.decomposition?.compoundingEffect); $('trackingDifference').textContent = percent(result.decomposition?.trackingDifference);
  lineChart('#comparison', result.rows.length ? [{ name: '原型', values: result.rows.map(row => ({ date: row.date, value: row.underlying })) }, { name: '理論槓桿', values: result.rows.map(row => ({ date: row.date, value: row.theoretical })) }, { name: '實際 ETF', values: result.rows.map(row => ({ date: row.date, value: row.actual })) }] : [], { percent: false });
}

function renderModel() {
  const result = volatilityDragModel({ expectedReturn: (Number($('expectedReturn').value) || 0) / 100, volatility: (Number($('volatility').value) || 0) / 100, leverage: Number($('modelLeverage').value) || 2, holdingYears: Number($('holdingYears').value) || 1 });
  $('arithmetic').textContent = percent(result.arithmeticReturn); $('geometric').textContent = percent(result.expectedLeveragedCagr); $('drag').textContent = percent(result.volatilityDrag); $('terminal').textContent = number(result.terminalGrowth);
}

$('run').addEventListener('click', renderComparison); ['underlying', 'actual', 'leverage'].forEach(id => $(id).addEventListener('change', renderComparison)); $('model').addEventListener('click', renderModel); renderModel(); renderComparison();
