import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSuitabilityMatrix, evaluateSuitability } from '../site/js/core/suitability-engine.js';

const strategy = (id, status = 'verified') => ({ strategy_id: id, implementation_status: status, data_type: 'actual_etf' });

test('hard constraints exclude pledge and excessive drawdown', () => {
  const result = evaluateSuitability(strategy('pledge_006208_dynamic'), { cagr: 0.12, max_drawdown: -0.42, cvar95: -0.2 }, { maxDrawdown: 0.35, acceptPledge: false });
  assert.equal(result.status, 'excluded');
  assert.equal(result.score, 0);
  assert.equal(result.hard_failures.length, 2);
});

test('research fit exposes transparent score components', () => {
  const result = evaluateSuitability(strategy('buy_hold_006208'), { cagr: 0.1, max_drawdown: -0.2, cvar95: -0.08, recovery_duration: 30 });
  assert.equal(result.status, 'research_fit');
  assert.ok(result.score > 0);
  assert.deepEqual(Object.keys(result.components), ['return', 'drawdown_control', 'tail_risk', 'recovery', 'evidence']);
});

test('suitability matrix returns separate research profiles', () => {
  const matrix = buildSuitabilityMatrix(
    [strategy('buy_hold_006208'), strategy('pledge_006208_dynamic', 'experimental')],
    {
      buy_hold_006208: { cagr: 0.1, max_drawdown: -0.2, cvar95: -0.1 },
      pledge_006208_dynamic: { cagr: 0.2, max_drawdown: -0.4, cvar95: -0.2 },
    },
  );
  assert.deepEqual(Object.keys(matrix), ['capital_growth', 'balanced', 'drawdown_control']);
  assert.equal(matrix.balanced[1].status, 'excluded');
});
