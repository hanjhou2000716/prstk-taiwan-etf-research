function cleanRows(rows) { return (rows || []).filter(row => row?.date && Number(row.nav) > 0).sort((a, b) => String(a.date).localeCompare(String(b.date))); }
function dailyReturns(rows) { const source = cleanRows(rows); const out = new Map(); for (let index = 1; index < source.length; index += 1) out.set(source[index].date, Number(source[index].nav) / Number(source[index - 1].nav) - 1); return out; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

export function calculateBetaMetrics(rows, benchmarkRows, { riskFreeRate = 0, tradingDaysPerYear = 252 } = {}) {
  const asset = dailyReturns(rows); const benchmark = dailyReturns(benchmarkRows); const dates = [...asset.keys()].filter(date => benchmark.has(date));
  if (dates.length < 3) return { status: 'unavailable', reason: '共同交易日不足，無法計算 Beta', observations: dates.length };
  const assetValues = dates.map(date => asset.get(date)); const benchmarkValues = dates.map(date => benchmark.get(date));
  const assetMean = mean(assetValues); const benchmarkMean = mean(benchmarkValues);
  const covariance = assetValues.reduce((sum, value, index) => sum + (value - assetMean) * (benchmarkValues[index] - benchmarkMean), 0) / (dates.length - 1);
  const assetVariance = assetValues.reduce((sum, value) => sum + (value - assetMean) ** 2, 0) / (dates.length - 1);
  const benchmarkVariance = benchmarkValues.reduce((sum, value) => sum + (value - benchmarkMean) ** 2, 0) / (dates.length - 1);
  const beta = benchmarkVariance ? covariance / benchmarkVariance : null;
  const correlation = assetVariance && benchmarkVariance ? covariance / Math.sqrt(assetVariance * benchmarkVariance) : null;
  const tracking = assetValues.map((value, index) => value - benchmarkValues[index]); const trackingMean = mean(tracking);
  const trackingError = tracking.length > 1 ? Math.sqrt(tracking.reduce((sum, value) => sum + (value - trackingMean) ** 2, 0) / (tracking.length - 1)) * Math.sqrt(tradingDaysPerYear) : null;
  const dailyRf = riskFreeRate / tradingDaysPerYear;
  const up = dates.map((date, index) => [asset.get(date), benchmark.get(date)]).filter(([, value]) => value > 0);
  const down = dates.map((date, index) => [asset.get(date), benchmark.get(date)]).filter(([, value]) => value < 0);
  const capture = values => values.length && mean(values.map(pair => pair[1])) ? mean(values.map(pair => pair[0])) / mean(values.map(pair => pair[1])) : null;
  return { status: 'available', start: dates[0], end: dates.at(-1), observations: dates.length, beta, alpha: (assetMean - dailyRf - (beta || 0) * (benchmarkMean - dailyRf)) * tradingDaysPerYear, rSquared: correlation == null ? null : correlation ** 2, correlation, trackingError, informationRatio: trackingError ? trackingMean * tradingDaysPerYear / trackingError : null, treynor: beta ? (assetMean * tradingDaysPerYear - riskFreeRate) / beta : null, upCapture: capture(up), downCapture: capture(down) };
}

export function rollingBeta(rows, benchmarkRows, window = 60) {
  const asset = dailyReturns(rows); const benchmark = dailyReturns(benchmarkRows); const dates = [...asset.keys()].filter(date => benchmark.has(date)); const out = []; const size = Math.max(3, Number(window) || 60);
  for (let end = size; end <= dates.length; end += 1) {
    const slice = dates.slice(end - size, end); const assetValues = slice.map(date => asset.get(date)); const benchmarkValues = slice.map(date => benchmark.get(date));
    const assetMean = mean(assetValues); const benchmarkMean = mean(benchmarkValues);
    const covariance = assetValues.reduce((sum, value, index) => sum + (value - assetMean) * (benchmarkValues[index] - benchmarkMean), 0) / (slice.length - 1);
    const variance = benchmarkValues.reduce((sum, value) => sum + (value - benchmarkMean) ** 2, 0) / (slice.length - 1);
    out.push({ date: slice.at(-1), value: variance ? covariance / variance : null });
  }
  return out;
}
