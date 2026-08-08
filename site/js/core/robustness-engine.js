const finite = value => Number.isFinite(Number(value));

export function numericRange({ start, end, step, include = [] } = {}) {
  const values = [];
  const first = Number(start);
  const last = Number(end);
  const increment = Math.abs(Number(step));
  if (finite(first) && finite(last) && increment > 0 && first <= last) {
    for (let value = first; value <= last + increment * 1e-9; value += increment) values.push(Number(value.toFixed(10)));
  }
  return [...new Set([...values, ...include.map(Number).filter(finite)])].sort((a, b) => a - b);
}

export function evaluateGrid(xValues, yValues, evaluator) {
  const x = xValues.map(Number).filter(finite);
  const y = yValues.map(Number).filter(finite);
  const matrix = y.map(yValue => x.map(xValue => {
    const result = evaluator({ x: xValue, y: yValue });
    const value = typeof result === 'object' ? Number(result?.value) : Number(result);
    return finite(value) ? value : null;
  }));
  const points = matrix.flatMap((row, yIndex) => row.flatMap((value, xIndex) => value == null ? [] : [{ x: x[xIndex], y: y[yIndex], value }]));
  const ordered = [...points].sort((a, b) => b.value - a.value);
  return { xValues: x, yValues: y, matrix, points, validCount: points.length, best: ordered[0] || null, worst: ordered.at(-1) || null };
}

export function robustnessSummary(grid, { tolerance = 0.05 } = {}) {
  const values = (grid?.points || []).map(point => point.value).filter(finite);
  if (!values.length) return { status: 'unavailable', validCount: 0, median: null, spread: null, stableRegion: [], potentialCurveFitting: false };
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const best = grid.best?.value ?? Math.max(...values);
  const threshold = best - Math.abs(best || 1) * tolerance;
  const stableRegion = (grid.points || []).filter(point => point.value >= threshold);
  return { status: 'available', validCount: values.length, median, minimum: Math.min(...values), maximum: Math.max(...values), spread: Math.max(...values) - Math.min(...values), best, stableRegion, stableRegionCount: stableRegion.length, potentialCurveFitting: Boolean(grid.best && stableRegion.length <= 2 && values.length >= 5) };
}

export function neighborRobustness(grid, point = grid?.best) {
  if (!point || !grid?.xValues?.length || !grid?.yValues?.length) return { status: 'unavailable', neighbors: [] };
  const xIndex = grid.xValues.indexOf(point.x);
  const yIndex = grid.yValues.indexOf(point.y);
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const value = grid.matrix[yIndex + dy]?.[xIndex + dx];
    if (finite(value)) neighbors.push({ x: grid.xValues[xIndex + dx], y: grid.yValues[yIndex + dy], value: Number(value) });
  }
  const average = neighbors.length ? neighbors.reduce((sum, item) => sum + item.value, 0) / neighbors.length : null;
  return { status: neighbors.length ? 'available' : 'unavailable', neighbors, average, gapToBest: average == null ? null : point.value - average };
}
