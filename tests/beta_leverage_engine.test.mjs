import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBetaMetrics } from '../site/js/core/beta-engine.js';
import { leverageComparison, volatilityDragModel } from '../site/js/core/leverage-engine.js';

const rows = values => values.map((nav, index) => ({ date: `2020-01-${String(index + 1).padStart(2, '0')}`, nav }));

test('beta metrics use date-aligned daily returns and separate risk-free rate', () => {
  const result = calculateBetaMetrics(rows([100, 110, 99, 120, 132]), rows([100, 105, 100, 110, 115]), { riskFreeRate: 0.02 });
  assert.equal(result.status, 'available');
  assert.equal(result.observations, 4);
  assert.ok(Number.isFinite(result.beta));
  assert.ok(Number.isFinite(result.alpha));
});

test('leverage comparison reports path-based decomposition', () => {
  const result = leverageComparison(rows([100, 110, 99, 120]), rows([100, 120, 96, 135]), 2);
  assert.equal(result.status, 'available');
  assert.equal(result.rows.length, 4);
  assert.ok(Math.abs(result.decomposition.linearLeveragedReturn - 0.4) < 1e-12);
  assert.ok(Number.isFinite(result.decomposition.trackingDifference));
});

test('volatility drag increases with leverage', () => {
  const one = volatilityDragModel({ expectedReturn: 0.08, volatility: 0.2, leverage: 1 });
  const two = volatilityDragModel({ expectedReturn: 0.08, volatility: 0.2, leverage: 2 });
  assert.ok(two.volatilityDrag > one.volatilityDrag);
});
