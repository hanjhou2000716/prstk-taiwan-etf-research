import assert from 'node:assert/strict';
import test from 'node:test';
import { crisisMetrics, rollingRisk } from '../site/js/core/risk-engine.js';

const rows = values => values.map((nav, index) => ({
  date: `2020-01-${String(index + 1).padStart(2, '0')}`,
  nav,
}));

test('rolling risk exposes Sharpe and Sortino using the requested window', () => {
  const result = rollingRisk(rows([100, 102, 101, 104, 103]), 3);
  assert.equal(result.length, 3);
  assert.ok(Number.isFinite(result[0].sharpe));
  assert.ok(Number.isFinite(result[0].sortino));
  assert.ok(Number.isFinite(result[0].maxDrawdown));
});

test('crisis drawdown is path-aware rather than peak/trough-independent', () => {
  const result = crisisMetrics(rows([100, 120, 90, 110]), '2020-01-01', '2020-01-04');
  assert.equal(result.status, 'available');
  assert.equal(Number(result.maxDrawdown.toFixed(8)), -0.25);
  assert.equal(Number(result.return.toFixed(8)), 0.1);
});
