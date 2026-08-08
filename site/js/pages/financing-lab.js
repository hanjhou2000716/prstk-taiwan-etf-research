import { parseCsv } from '../core/date-alignment.js';
import { formatMetric } from '../core/metrics.js';
import { lineChart } from '../charts/svg-charts.js';

const $ = id => document.getElementById(id);
const numericFields = new Set([
  'nav', 'debt', 'interest', 'collateral_value', 'eligible_collateral_value',
  'eligible_target_value', 'eligible_total_value', 'non_eligible_asset_value',
  'target_value', 'maintenance', 'required_repayment',
  'required_additional_collateral', 'liquidation_proceeds', 'net_equity',
]);
const money = value => Number.isFinite(value) ? formatMetric(value, 'money') : '—';
const pct = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—';

const [catalog, financing] = await Promise.all([
  fetch('data/strategy-catalog.json').then(response => response.json()),
  fetch('data/financing_model.json').then(response => response.json()).catch(() => ({ terms: {} })),
]);
const pledgeStrategies = catalog.strategies.filter(strategy => strategy.strategy_id.startsWith('pledge_'));
const data = {};

for (const strategy of pledgeStrategies) {
  const response = await fetch(`data/backtests/${strategy.strategy_id}.csv`);
  if (!response.ok) continue;
  data[strategy.strategy_id] = parseCsv(await response.text()).map(row => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, numericFields.has(key) ? Number(value) : value]),
  ));
}

function populate() {
  pledgeStrategies.forEach(strategy => {
    const option = document.createElement('option');
    option.value = strategy.strategy_id;
    option.textContent = `${strategy.display_name} · ${strategy.implementation_status}`;
    $('strategy').append(option);
  });
}

function render() {
  const rows = data[$('strategy').value] || [];
  const first = rows[0];
  const last = rows.at(-1);
  const events = rows.filter(row => row.margin_call === 'True' || row.margin_call === true || row.liquidation_event);
  if (!first || !last) {
    $('status').textContent = '沒有可用的質押帳本資料。';
    return;
  }
  const terms = financing.terms || {};
  const marginCall = Number(terms.maintenance_ratio?.margin_call) || 1.3;
  const liquidation = Number(terms.forced_liquidation_ratio) || 1.1;
  const eligibleTotal = Number.isFinite(last.eligible_total_value)
    ? last.eligible_total_value
    : last.eligible_collateral_value;
  $('status').textContent = `${first.date} 至 ${last.date} · ${rows.length} 個交易日 · 維持率門檻 ${pct(marginCall)} · 研究模型假設`;
  $('collateral').textContent = money(last.collateral_value);
  $('eligible').textContent = money(eligibleTotal);
  $('debt').textContent = money(last.debt);
  $('interest').textContent = money(last.interest);
  $('maintenance').textContent = pct(last.maintenance);
  $('equity').textContent = money(last.net_equity);
  $('calls').textContent = events.filter(row => row.margin_call === 'True' || row.margin_call === true).length;
  $('liquidations').textContent = events.filter(row => row.liquidation_event).length;

  lineChart('#ledger', [
    { name: 'Debt', values: rows.map(row => ({ value: row.debt })) },
    { name: 'Collateral', values: rows.map(row => ({ value: row.collateral_value })) },
    { name: 'Eligible Collateral', values: rows.map(row => ({ value: Number.isFinite(row.eligible_total_value) ? row.eligible_total_value : row.eligible_collateral_value })) },
    { name: 'Net Equity', values: rows.map(row => ({ value: row.net_equity })) },
  ]);
  lineChart('#maintenanceChart', [
    { name: 'Maintenance Ratio', values: rows.map(row => ({ value: row.maintenance })) },
    { name: `Margin Call ${pct(marginCall)}`, values: rows.map(() => ({ value: marginCall })) },
    { name: `Forced Liquidation ${pct(liquidation)}`, values: rows.map(() => ({ value: liquidation })) },
  ]);
  $('events').replaceChildren(...events.slice(-20).reverse().map(row => {
    const item = document.createElement('div');
    item.className = 'stack-item';
    item.textContent = `${row.date} · ${row.margin_call === 'True' || row.margin_call === true ? '追繳' : ''}${row.liquidation_event ? ` ${row.liquidation_event}` : ''}`;
    return item;
  }));
}

populate();
$('strategy').addEventListener('change', render);
render();
