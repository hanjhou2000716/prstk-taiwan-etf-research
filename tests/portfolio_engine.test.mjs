import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPortfolioSeries } from '../site/js/core/portfolio-engine.js';

const series = values => values.map((nav, index) => ({
  date: `2020-01-${String(index + 1).padStart(2, '0')}`,
  nav,
}));

test('composer keeps unallocated capital as cash and records initial trades', () => {
  const result = buildPortfolioSeries({ asset: series([1, 1.1, 1.2]) }, { asset: 0.5, cash: 0 }, { rebalancing: 'buy_hold' });
  assert.equal(result.rows[0].cash, 0.5);
  assert.equal(result.rows.at(-1).nav, 1.1);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].action, 'BUY');
});

test('rebalancing emits an auditable buy or sell ledger event', () => {
  const result = buildPortfolioSeries(
    { asset: series([1, 1.2, 1.2]), other: series([1, 1, 1.1]) },
    { asset: 0.5, other: 0.5, cash: 0 },
    { rebalancing: 'daily', costRate: 0.001 },
  );
  assert.ok(result.rows.some(row => row.rebalanced));
  assert.ok(result.ledger.some(event => event.reason === 'rebalance'));
  assert.ok(result.rows.some(row => row.transaction_cost > 0));
});

test('composer does not silently accept leverage or short weights', () => {
  const assets = { asset: series([1, 1.1]) };
  assert.deepEqual(buildPortfolioSeries(assets, { asset: 1.1, cash: 0 }).invalidWeights, ['leverage_requires_financing_engine']);
  assert.deepEqual(buildPortfolioSeries(assets, { asset: -0.1, cash: 1.1 }).invalidWeights, ['asset']);
});

test('empty asset allocation returns a safe empty result', () => {
  const result = buildPortfolioSeries({ asset: series([1, 1.1]) }, { asset: 0, cash: 1 });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.ledger, []);
});
