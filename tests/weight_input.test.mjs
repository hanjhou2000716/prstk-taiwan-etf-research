import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateWeights } from '../site/js/core/weight-input.js';

test('composer aggregates duplicate asset rows instead of overwriting earlier weights', () => {
  assert.deepEqual(
    aggregateWeights([
      { id: 'buy_hold_006208', weight: 0.5 },
      { id: 'buy_hold_006208', weight: 0 },
      { id: 'buy_hold_00685L', weight: 0.25 },
    ]),
    { buy_hold_006208: 0.5, buy_hold_00685L: 0.25 },
  );
});
