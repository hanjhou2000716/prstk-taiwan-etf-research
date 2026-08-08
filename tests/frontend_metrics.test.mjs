import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMetrics, drawdownEpisodes, monthlyReturns } from '../site/js/core/metrics.js';

const rows = values => values.map((nav, index) => ({
  date: `2020-01-${String(index + 1).padStart(2, '0')}`,
  nav,
}));

test('frontend metrics preserve the canonical golden sequence', () => {
  const result = calculateMetrics(rows([100, 110, 99, 120]));
  assert.equal(Number(result.totalReturn.toFixed(8)), 0.2);
  assert.equal(Number(result.maxDrawdown.toFixed(8)), -0.1);
  assert.equal(result.riskFreeRate, 0);
});

test('drawdown duration is measured from the event indices and dates', () => {
  const result = drawdownEpisodes(rows([1, 2, 1, 2]));
  assert.equal(result[0].peakToTroughDays, 1);
  assert.equal(result[0].troughToRecoveryDays, 1);
  assert.equal(result[0].underwaterDays, 2);
  assert.equal(result[0].peakToTroughCalendarDays, 1);
  assert.equal(result[0].underwaterCalendarDays, 2);
});

test('monthly returns compound only the observations in each calendar month', () => {
  const result = monthlyReturns([
    { date: '2020-01-31', nav: 100 },
    { date: '2020-02-03', nav: 110 },
    { date: '2020-02-28', nav: 99 },
    { date: '2020-03-02', nav: 120 },
  ]);
  assert.deepEqual(result.map(row => row.month), ['2020-02', '2020-03']);
  assert.equal(Number(result[0].return.toFixed(8)), -0.01);
  assert.equal(Number(result[1].return.toFixed(8)), 0.21212121);
});

test('metrics use an existing net path and gross path without applying hidden cost twice', () => {
  const result = calculateMetrics([
    { date: '2020-01-01', nav_gross: 1, nav: 1 },
    { date: '2020-01-02', nav_gross: 1.1, nav: 1.09 },
  ]);
  assert.equal(Number(result.grossTotalReturn.toFixed(8)), 0.1);
  assert.equal(Number(result.totalReturn.toFixed(8)), 0.09);
  assert.equal(Number(result.costDrag.toFixed(8)), 0.01);
});
