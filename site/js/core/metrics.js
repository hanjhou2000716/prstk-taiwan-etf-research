const finite = value => Number.isFinite(Number(value));

function validRows(rows, valueField = 'nav') {
  return (rows || [])
    .map(row => ({ ...row, nav: Number(row[valueField]) }))
    .filter(row => row.date && finite(row.nav) && row.nav > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function quantile(values, probability) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  const weight = position - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function dateDifference(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

export function returnsFromNav(rows, { valueField = 'nav' } = {}) {
  const series = validRows(rows, valueField);
  return series.slice(1).map((row, index) => ({
    date: row.date,
    value: row.nav / series[index].nav - 1,
  })).filter(row => finite(row.value));
}

export function maxDrawdown(rows, { valueField = 'nav' } = {}) {
  const series = validRows(rows, valueField);
  let peak = -Infinity;
  let peakDate = null;
  let worst = 0;
  let trough = null;
  const points = [];
  for (const row of series) {
    if (row.nav > peak) {
      peak = row.nav;
      peakDate = row.date;
    }
    const drawdown = row.nav / peak - 1;
    if (drawdown < worst) {
      worst = drawdown;
      trough = row.date;
    }
    points.push({ date: row.date, drawdown });
  }
  return { value: worst, start: peakDate, trough, points };
}

export function drawdownEpisodes(rows, { valueField = 'nav' } = {}) {
  const series = validRows(rows, valueField);
  const episodes = [];
  let peakIndex = null;
  let troughIndex = null;
  let peakNav = -Infinity;
  let minimum = 0;

  const closeEpisode = recoveryIndex => {
    if (peakIndex === null || troughIndex === null || minimum >= 0) return;
    const peak = series[peakIndex];
    const trough = series[troughIndex];
    const recovery = recoveryIndex === null ? null : series[recoveryIndex];
    episodes.push({
      peak: peak.date,
      start: peak.date,
      trough: trough.date,
      recovery: recovery?.date || null,
      drawdown: minimum,
      peakToTroughDays: troughIndex - peakIndex,
      troughToRecoveryDays: recovery ? recoveryIndex - troughIndex : null,
      underwaterDays: recovery ? recoveryIndex - peakIndex : series.length - 1 - peakIndex,
      peakToTroughCalendarDays: dateDifference(peak.date, trough.date),
      troughToRecoveryCalendarDays: recovery ? dateDifference(trough.date, recovery.date) : null,
      underwaterCalendarDays: dateDifference(peak.date, recovery?.date || series.at(-1)?.date),
      recovered: Boolean(recovery),
      recoveryIndex,
    });
  };

  series.forEach((row, index) => {
    if (row.nav >= peakNav) {
      closeEpisode(index);
      peakNav = row.nav;
      peakIndex = index;
      troughIndex = null;
      minimum = 0;
      return;
    }
    const drawdown = row.nav / peakNav - 1;
    if (drawdown < minimum) {
      minimum = drawdown;
      troughIndex = index;
    }
  });
  closeEpisode(null);
  return episodes.sort((a, b) => a.drawdown - b.drawdown);
}

function pairedReturns(assetRows, benchmarkRows, valueField = 'nav') {
  const asset = returnsFromNav(assetRows, { valueField });
  const benchmark = returnsFromNav(benchmarkRows, { valueField });
  const benchmarkByDate = new Map(benchmark.map(row => [row.date, row.value]));
  return asset.filter(row => benchmarkByDate.has(row.date))
    .map(row => [row.value, benchmarkByDate.get(row.date)]);
}

export function calculateMetrics(rows, {
  benchmarkRows = null,
  riskFreeRate = 0,
  tradingDaysPerYear = 252,
  annualCost = 0,
  valueField = 'nav',
  grossValueField = null,
} = {}) {
  const source = validRows(rows, valueField);
  if (source.length < 2) return { status: 'unavailable', reason: '資料不足' };

  const inferredGrossField = grossValueField || ((rows || []).some(row => finite(row.nav_gross)) ? 'nav_gross' : null);
  const grossSource = inferredGrossField ? validRows(rows, inferredGrossField) : source;
  const grossByDate = new Map(grossSource.map(row => [row.date, row.nav]));
  const dailyCost = Math.max(0, Number(annualCost) || 0) / tradingDaysPerYear;
  const netRows = [{ date: source[0].date, nav: source[0].nav }];
  for (let index = 1; index < source.length; index += 1) {
    const grossReturn = source[index].nav / source[index - 1].nav;
    netRows.push({
      date: source[index].date,
      nav: netRows[index - 1].nav * grossReturn * Math.max(0, 1 - dailyCost),
    });
  }

  // The recurrence above preserves an existing net path and applies an optional
  // explicit annual cost once. When no annualCost is supplied, netRows equals source.
  const returns = returnsFromNav(netRows);
  const grossGrowth = grossByDate.has(source.at(-1).date)
    ? grossByDate.get(source.at(-1).date) / grossByDate.get(source[0].date) - 1
    : source.at(-1).nav / source[0].nav - 1;
  const netGrowth = netRows.at(-1).nav / netRows[0].nav - 1;
  const years = (netRows.length - 1) / tradingDaysPerYear;
  const mean = returns.length ? returns.reduce((sum, row) => sum + row.value, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((sum, row) => sum + (row.value - mean) ** 2, 0) / (returns.length - 1)
    : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(tradingDaysPerYear);
  const dailyRf = riskFreeRate / tradingDaysPerYear;
  const downsideValues = returns.map(row => Math.min(0, row.value - dailyRf));
  const downsideDeviation = downsideValues.length
    ? Math.sqrt(downsideValues.reduce((sum, value) => sum + value ** 2, 0) / downsideValues.length) * Math.sqrt(tradingDaysPerYear)
    : 0;
  const cagr = Math.max(netGrowth + 1, 0) ** (1 / Math.max(years, 1 / tradingDaysPerYear)) - 1;
  const drawdown = maxDrawdown(netRows);
  const episodes = drawdownEpisodes(netRows);
  const distribution = returns.map(row => row.value);
  const var95 = quantile(distribution, 0.05);
  const var99 = quantile(distribution, 0.01);
  const cvar = threshold => {
    const tail = distribution.filter(value => value <= threshold);
    return tail.length ? tail.reduce((sum, value) => sum + value, 0) / tail.length : null;
  };
  const paired = benchmarkRows ? pairedReturns(netRows, benchmarkRows) : [];
  let beta = null;
  let alpha = null;
  let correlation = null;
  if (paired.length > 2) {
    const assetValues = paired.map(pair => pair[0]);
    const benchmarkValues = paired.map(pair => pair[1]);
    const assetMean = assetValues.reduce((sum, value) => sum + value, 0) / paired.length;
    const benchmarkMean = benchmarkValues.reduce((sum, value) => sum + value, 0) / paired.length;
    const covariance = paired.reduce((sum, pair) => sum + (pair[0] - assetMean) * (pair[1] - benchmarkMean), 0) / (paired.length - 1);
    const benchmarkVariance = benchmarkValues.reduce((sum, value) => sum + (value - benchmarkMean) ** 2, 0) / (paired.length - 1);
    const assetVariance = assetValues.reduce((sum, value) => sum + (value - assetMean) ** 2, 0) / (paired.length - 1);
    beta = benchmarkVariance ? covariance / benchmarkVariance : null;
    correlation = assetVariance && benchmarkVariance ? covariance / Math.sqrt(assetVariance * benchmarkVariance) : null;
    alpha = (assetMean - dailyRf - (beta || 0) * (benchmarkMean - dailyRf)) * tradingDaysPerYear;
  }
  return {
    status: 'available',
    start: netRows[0].date,
    end: netRows.at(-1).date,
    observations: netRows.length,
    years,
    grossTotalReturn: grossGrowth,
    totalReturn: netGrowth,
    roi: netGrowth,
    cagr,
    annualizedReturn: cagr,
    annualizedVolatility: volatility,
    downsideDeviation,
    sharpe: volatility ? (mean * tradingDaysPerYear - riskFreeRate) / volatility : null,
    sortino: downsideDeviation ? (mean * tradingDaysPerYear - riskFreeRate) / downsideDeviation : null,
    calmar: drawdown.value ? cagr / Math.abs(drawdown.value) : null,
    maxDrawdown: drawdown.value,
    maxDrawdownStart: drawdown.start,
    maxDrawdownTrough: drawdown.trough,
    maxDrawdownDuration: episodes[0]?.underwaterDays || 0,
    recoveryDuration: episodes[0]?.troughToRecoveryDays ?? null,
    bestDay: returns.length ? Math.max(...distribution) : null,
    worstDay: returns.length ? Math.min(...distribution) : null,
    positiveDayRatio: returns.length ? distribution.filter(value => value > 0).length / returns.length : null,
    var95,
    cvar95: cvar(var95),
    var99,
    cvar99: cvar(var99),
    costDrag: grossGrowth - netGrowth,
    beta,
    alpha,
    correlation,
    endingWealth: netRows.at(-1).nav / netRows[0].nav,
    riskFreeRate,
    episodes,
  };
}

export function formatMetric(value, type = 'percent') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  if (type === 'money') return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
  if (type === 'number') return Number(value).toFixed(2);
  return `${(Number(value) * 100).toFixed(2)}%`;
}

export function monthlyReturns(rows, { valueField = 'nav' } = {}) {
  const daily = returnsFromNav(rows, { valueField });
  const buckets = new Map();
  daily.forEach(row => buckets.set(row.date.slice(0, 7), (buckets.get(row.date.slice(0, 7)) ?? 1) * (1 + row.value)));
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, growth]) => ({ month, return: growth - 1 }));
}

export function annualReturns(rows, { valueField = 'nav' } = {}) {
  const daily = returnsFromNav(rows, { valueField });
  const buckets = new Map();
  daily.forEach(row => buckets.set(row.date.slice(0, 4), (buckets.get(row.date.slice(0, 4)) ?? 1) * (1 + row.value)));
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, growth]) => ({ year, return: growth - 1 }));
}

export function returnDistribution(rows, { valueField = 'nav' } = {}) {
  const values = returnsFromNav(rows, { valueField }).map(row => row.value);
  const var95 = quantile(values, 0.05);
  const var99 = quantile(values, 0.01);
  const tail = threshold => {
    const valuesInTail = values.filter(value => value <= threshold);
    return valuesInTail.length ? valuesInTail.reduce((sum, value) => sum + value, 0) / valuesInTail.length : null;
  };
  return {
    count: values.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    median: quantile(values, 0.5),
    p05: var95,
    p95: quantile(values, 0.95),
    var95,
    cvar95: tail(var95),
    var99,
    cvar99: tail(var99),
  };
}
