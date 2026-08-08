import { alignSeries } from './date-alignment.js';

function shouldRebalance(index, date, frequency, dates) {
  if (frequency === 'buy_hold') return false;
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') return index > 0 && index % 5 === 0;
  if (frequency === 'monthly') return index > 0 && date.slice(0, 7) !== dates[index - 1].slice(0, 7);
  if (frequency === 'quarterly') return index > 0 && Math.floor(new Date(date).getMonth() / 3) !== Math.floor(new Date(dates[index - 1]).getMonth() / 3);
  if (frequency === 'yearly') return index > 0 && date.slice(0, 4) !== dates[index - 1].slice(0, 4);
  return false;
}

function exposure(values, cash, nav) {
  const gross = Object.values(values).reduce((sum, value) => sum + Math.abs(value), 0);
  const net = Object.values(values).reduce((sum, value) => sum + value, 0);
  return {
    grossExposure: nav ? gross / nav : 0,
    netExposure: nav ? net / nav : 0,
    cashWeight: nav ? cash / nav : 0,
  };
}

export function buildPortfolioSeries(assetSeries, weights, {
  cashYield = 0,
  tradingDaysPerYear = 252,
  rebalancing = 'daily',
  costRate = 0,
  rebalanceBand = 0,
} = {}) {
  const entries = Object.entries(weights).filter(([id]) => id !== 'cash');
  const invalidWeights = entries.filter(([, weight]) => Number(weight) < 0).map(([id]) => id);
  if (invalidWeights.length) {
    return { rows: [], coverage: { rows: [], start: null, end: null, missing: 0 }, missingAssets: [], invalidWeights, ledger: [] };
  }
  const requested = entries.filter(([, weight]) => Number(weight) !== 0);
  const requestedWeight = requested.reduce((sum, [, weight]) => sum + (Number(weight) || 0), 0);
  const requestedCash = Number(weights.cash) || 0;
  if (requestedWeight + requestedCash > 1 + 1e-9) {
    return { rows: [], coverage: { rows: [], start: null, end: null, missing: 0 }, missingAssets: [], invalidWeights: ['leverage_requires_financing_engine'], ledger: [] };
  }
  const missingAssets = requested.filter(([id]) => !assetSeries[id]?.length).map(([id]) => id);
  if (missingAssets.length) return { rows: [], coverage: { rows: [], start: null, end: null, missing: 0 }, missingAssets, ledger: [] };
  const active = Object.fromEntries(requested.map(([id]) => [id, assetSeries[id]]));
  const aligned = alignSeries(active, 'common_period');
  if (aligned.rows.length < 2) return { rows: [], coverage: aligned, missingAssets: [], ledger: [] };

  const assetWeights = Object.fromEntries(requested.map(([id, weight]) => [id, Number(weight) || 0]));
  // Unallocated capital remains cash. Borrowing/leverage is deliberately
  // rejected above until a financing model is supplied for this composer.
  const cashTarget = requestedCash + Math.max(0, 1 - requestedWeight - requestedCash);
  let units = Object.fromEntries(requested.map(([id, weight]) => [id, weight]));
  let cash = cashTarget;
  const dates = aligned.rows.map(row => row.date);
  const ledger = requested.map(([id]) => ({
    date: dates[0], strategy: 'portfolio', asset: id, action: 'BUY', quantity: units[id],
    price: Number(aligned.rows[0].values[id].nav), gross_amount: Math.abs(units[id]),
    transaction_fee: 0, tax: 0, slippage: 0, reason: 'initial allocation', signal: 'initial',
  }));
  const initialValues = Object.fromEntries(requested.map(([id]) => [id, units[id] * Number(aligned.rows[0].values[id].nav)]));
  let nav = Object.values(initialValues).reduce((sum, value) => sum + value, 0) + cash;
  if (!Number.isFinite(nav) || nav <= 0) return { rows: [], coverage: aligned, missingAssets: [], invalidWeights: ['non_positive_initial_nav'], ledger: [] };
  const initialExposure = exposure(initialValues, cash, nav);
  const out = [{ date: dates[0], nav: 1, nav_gross: 1, nav_net: 1, cash, turnover: 0, transaction_cost: 0, rebalanced: false, ...initialExposure }];

  for (let index = 1; index < aligned.rows.length; index += 1) {
    cash *= 1 + cashYield / tradingDaysPerYear;
    const values = Object.fromEntries(requested.map(([id]) => [id, units[id] * Number(aligned.rows[index].values[id].nav)]));
    let gross = Object.values(values).reduce((sum, value) => sum + value, 0) + cash;
    let turnover = 0;
    let transactionCost = 0;
    let rebalanced = shouldRebalance(index, dates[index], rebalancing, dates);
    const totalBefore = gross;
    const drift = Object.entries(values).reduce((max, [id, value]) => Math.max(max, Math.abs(value / Math.max(totalBefore, 1e-12) - assetWeights[id])), 0);
    if (rebalanceBand > 0 && drift < rebalanceBand) rebalanced = false;
    if (rebalanced) {
      for (const [id] of requested) {
        const price = Number(aligned.rows[index].values[id].nav);
        const targetValue = assetWeights[id] * totalBefore;
        const delta = targetValue - values[id];
        if (Math.abs(delta) < 1e-12) continue;
        const action = delta > 0 ? 'BUY' : 'SELL';
        turnover += Math.abs(delta);
        ledger.push({
          date: dates[index], strategy: 'portfolio', asset: id, action,
          quantity: Math.abs(delta / price), price, gross_amount: Math.abs(delta),
          transaction_fee: Math.abs(delta) * costRate, tax: 0, slippage: 0,
          reason: 'rebalance', signal: rebalancing,
        });
        units[id] = targetValue / price;
      }
      cash = cashTarget * totalBefore;
      transactionCost = turnover * costRate;
      cash -= transactionCost;
      gross = Object.entries(assetWeights).reduce((sum, [id]) => sum + units[id] * Number(aligned.rows[index].values[id].nav), 0) + cash;
    }
    nav = gross;
    const currentValues = Object.fromEntries(requested.map(([id]) => [id, units[id] * Number(aligned.rows[index].values[id].nav)]));
    out.push({
      date: dates[index], nav, nav_gross: gross + transactionCost, nav_net: gross, cash,
      turnover, transaction_cost: transactionCost, rebalanced,
      ...exposure(currentValues, cash, nav),
    });
  }
  return { rows: out, coverage: aligned, missingAssets: [], ledger };
}

export const DEFAULT_ASSETS = [
  { id: 'buy_hold_006208', label: '006208 原型', weight: 50 },
  { id: 'buy_hold_00685L', label: '00685L 正二', weight: 0 },
  { id: 'buy_hold_00631L', label: '00631L 正二', weight: 0 },
  { id: 'synthetic_2x_proxy_00685L', label: 'Synthetic 2X Proxy', weight: 0 },
  { id: 'cash', label: '現金', weight: 50 },
];
