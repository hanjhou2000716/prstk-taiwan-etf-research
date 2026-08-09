import { maintenanceRatio, stressGrid, pathStress } from '../core/pledge-model.js';
import { lineChart } from '../charts/svg-charts.js?v=20260808-chart1';

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('zh-TW', {
  style: 'currency', currency: 'TWD', maximumFractionDigits: 0,
}).format(Number(value) || 0);
let currentPayload = null;
const declines = [0, .1, .2, .3, .4, .5, .6];
const ltvs = [.2, .3, .4, .5, .6];

function renderMatrix(matrix) {
  const head = $('head');
  const grid = $('grid');
  head.replaceChildren();
  const headerRow = document.createElement('tr');
  const header = document.createElement('th');
  header.textContent = '初始借款成數';
  header.scope = 'col';
  headerRow.append(header);
  declines.forEach(decline => {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = `跌幅 ${(decline * 100).toFixed(0)}%`;
    headerRow.append(cell);
  });
  head.append(headerRow);
  grid.replaceChildren(...matrix.map(row => {
    const tr = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = `${(row.initialLtv * 100).toFixed(0)}%`;
    tr.append(label);
    row.values.forEach(value => {
      const cell = document.createElement('td');
      if (value.marginCall) cell.className = 'danger-note';
      cell.textContent = `${(value.ratio * 100).toFixed(1)}%`;
      const detail = document.createElement('small');
      detail.textContent = `缺口 ${money(value.shortfall)}`;
      cell.append(document.createElement('br'), detail);
      tr.append(cell);
    });
    return tr;
  }));
}

function run() {
  const collateral = Number($('collateral').value) || 0;
  const debt = Number($('debt').value) || 0;
  const annualRate = (Number($('rate').value) || 0) / 100;
  const marginCall = (Number($('call').value) || 130) / 100;
  const rollover = (Number($('rollover').value) || 166) / 100;
  const release = (Number($('release').value) || 167) / 100;
  const forcedLiquidation = (Number($('forced').value) || 110) / 100;
  const haircut = (Number($('haircut').value) || 0) / 100;
  const monthlyCash = Number($('cash').value) || 0;
  const mode = $('mode').value;
  const scenario = $('scenario').value;
  const matrix = stressGrid({ collateral, debt, mode, marginCall, declines, ltvs });
  const path = pathStress({ collateral, debt, scenario, annualRate, marginCall, rollover, release, monthlyCash, forcedLiquidation, liquidationHaircut: haircut });
  const minimumMaintenance = Math.min(...path.rows.map(row => row.maintenance));
  $('current').textContent = `${(maintenanceRatio(collateral, debt) * 100).toFixed(1)}%`;
  $('firstCall').textContent = path.firstMarginCallDay == null ? '未觸及' : `第 ${path.firstMarginCallDay} 日`;
  $('firstLiquidation').textContent = path.firstLiquidationDay == null ? '未觸及' : `第 ${path.firstLiquidationDay} 日`;
  $('shortfall').textContent = money(path.maxShortfall);
  $('worst').textContent = `${(minimumMaintenance * 100).toFixed(1)}%`;
  $('equity').textContent = money(path.rows.at(-1)?.netEquity || 0);
  $('status').textContent = path.liquidated
    ? '此路徑觸及強制處分模型門檻。'
    : '此路徑在設定期間內未觸及強制處分模型門檻。';
  $('matrixMode').textContent = mode === 'fixed_ltv'
    ? '固定初始 LTV：每列本金＝擔保品 × 試算 LTV'
    : '目前帳戶本金：每列使用目前借款本金';

  const dateValue = (row, value) => ({ date: row.date, value });
  lineChart('#pathChart', [
    { name: '維持率', type: 'maintenance-ratio', unit: 'ratio', values: path.rows.map(row => dateValue(row, row.maintenance)) },
    { name: `追繳門檻 ${(marginCall * 100).toFixed(0)}%`, type: 'margin-call-threshold', unit: 'ratio', values: path.rows.map(row => dateValue(row, marginCall)) },
    { name: `借新還舊門檻 ${(rollover * 100).toFixed(0)}%`, type: 'rollover-threshold', unit: 'ratio', values: path.rows.map(row => dateValue(row, rollover)) },
    { name: `強制處分門檻 ${(forcedLiquidation * 100).toFixed(0)}%`, type: 'liquidation-threshold', unit: 'ratio', values: path.rows.map(row => dateValue(row, forcedLiquidation)) },
  ], { percent: false, colors: ['#4d6572', '#b45f45', '#876f52', '#8d3d3d'], capabilities: { logScale: false, table: true, range: true } });
  renderMatrix(matrix);
  currentPayload = { generated_at: new Date().toISOString(), parameters: { collateral, debt, annualRate, marginCall, rollover, release, forcedLiquidation, haircut, monthlyCash, mode, scenario }, path, matrix };
}

$('run').addEventListener('click', run);
$('export').addEventListener('click', () => {
  if (!currentPayload) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(currentPayload, null, 2)], { type: 'application/json' }));
  link.download = 'prstk-stress-test.json';
  link.click();
  URL.revokeObjectURL(link.href);
});
run();
