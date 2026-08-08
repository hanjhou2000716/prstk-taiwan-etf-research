import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGrid, neighborRobustness, numericRange, robustnessSummary } from '../site/js/core/robustness-engine.js';

test('numericRange includes requested endpoints and unique values', () => {
  assert.deepEqual(numericRange({ start: 0, end: 1, step: 0.5, include: [0.5, 2] }), [0, 0.5, 1, 2]);
});

test('evaluateGrid preserves missing evaluator values', () => {
  const grid = evaluateGrid([0, 1], [10, 20], ({ x, y }) => x === 1 && y === 20 ? null : x + y);
  assert.deepEqual(grid.matrix, [[10, 11], [20, null]]);
  assert.equal(grid.validCount, 3);
  assert.deepEqual(grid.best, { x: 0, y: 20, value: 20 });
});

test('robustness summary identifies a narrow optimum', () => {
  const grid = evaluateGrid([0, 1, 2, 3, 4], [0], ({ x }) => x === 2 ? 10 : 1);
  const summary = robustnessSummary(grid, { tolerance: 0.05 });
  assert.equal(summary.potentialCurveFitting, true);
  assert.equal(summary.stableRegionCount, 1);
  assert.equal(neighborRobustness(grid).gapToBest, 9);
});
