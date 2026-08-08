export function aggregateWeights(entries) {
  return entries.reduce((weights, entry) => {
    const id = String(entry.id || '');
    const weight = Number(entry.weight) || 0;
    if (!id) return weights;
    weights[id] = (weights[id] || 0) + weight;
    return weights;
  }, {});
}
