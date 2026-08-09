const KEY = 'prstk:experiments:v2';

export function listExperiments() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveExperiment(experiment) {
  const items = listExperiments().filter(item => item.experiment_id !== experiment.experiment_id);
  const next = { ...experiment, updated_at: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify([next, ...items].slice(0, 30))); } catch { return experiment; }
  return next;
}

export function deleteExperiment(id) {
  try { localStorage.setItem(KEY, JSON.stringify(listExperiments().filter(item => item.experiment_id !== id))); } catch { /* local storage may be unavailable */ }
}

export function newExperiment(input = {}) {
  return {
    experiment_id: globalThis.crypto?.randomUUID?.() || `exp-${Date.now()}`,
    name: input.name || '未命名研究實驗',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    data_version: input.data_version || 'site-snapshot-2026.08.04',
    model_version: input.model_version || 'phase2-p0-2026.08.04',
    parameters: input.parameters || {},
    metrics: input.metrics || {},
    warnings: input.warnings || [],
    selected_charts: input.selected_charts || [],
  };
}

export function cloneExperiment(experiment, name) {
  return newExperiment({ ...experiment, name: name || `${experiment.name || '研究實驗'}（複本）` });
}

export function downloadJson(data, filename = 'prstk-experiment.json') {
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'prstk-experiment.json';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}
