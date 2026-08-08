function validRows(rows) {
  return (rows || [])
    .map(row => ({ date: row.date, nav: Number(row.nav) }))
    .filter(row => row.date && Number.isFinite(row.nav) && row.nav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function dailyReturns(rows) {
  const output = [];
  for (let index = 1; index < rows.length; index += 1) {
    const value = rows[index].nav / rows[index - 1].nav - 1;
    if (Number.isFinite(value)) output.push({ date: rows[index].date, value });
  }
  return output;
}

function drawdownPath(rows) {
  let peak = -Infinity;
  return rows.map(row => {
    peak = Math.max(peak, row.nav);
    return { date: row.date, value: row.nav / peak - 1 };
  });
}

function windowMetrics(rows, riskFreeRate = 0, tradingDaysPerYear = 252) {
  if (rows.length < 2) return null;
  const returns = dailyReturns(rows).map(row => row.value);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
    : 0;
  const volatility = Math.sqrt(variance * tradingDaysPerYear);
  const dailyRf = riskFreeRate / tradingDaysPerYear;
  const downside = returns.map(value => Math.min(0, value - dailyRf));
  const downsideDeviation = Math.sqrt(downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length) * Math.sqrt(tradingDaysPerYear);
  const drawdown = drawdownPath(rows);
  const maxDrawdown = Math.min(...drawdown.map(row => row.value));
  const growth = rows.at(-1).nav / rows[0].nav;
  return {
    cagr: growth ** (tradingDaysPerYear / (rows.length - 1)) - 1,
    return: growth - 1,
    volatility,
    downsideDeviation,
    sharpe: volatility ? (mean * tradingDaysPerYear - riskFreeRate) / volatility : null,
    sortino: downsideDeviation ? (mean * tradingDaysPerYear - riskFreeRate) / downsideDeviation : null,
    maxDrawdown,
  };
}

export function rollingRisk(rows, window = 252, { riskFreeRate = 0, tradingDaysPerYear = 252 } = {}) {
  const series = validRows(rows);
  const output = [];
  for (let end = window; end <= series.length; end += 1) {
    const subset = series.slice(end - window, end);
    const metrics = windowMetrics(subset, riskFreeRate, tradingDaysPerYear);
    if (metrics) output.push({ date: subset.at(-1).date, ...metrics });
  }
  return output;
}

export function crisisMetrics(rows, start, end, { riskFreeRate = 0, tradingDaysPerYear = 252 } = {}) {
  const slice = validRows(rows).filter(row => row.date >= start && row.date <= end);
  if (slice.length < 2) return { status: 'unavailable', start, end, observations: slice.length };
  return {
    status: 'available',
    start: slice[0].date,
    end: slice.at(-1).date,
    observations: slice.length,
    ...windowMetrics(slice, riskFreeRate, tradingDaysPerYear),
  };
}

export function rollingDrawdown(rows) {
  return drawdownPath(validRows(rows));
}
