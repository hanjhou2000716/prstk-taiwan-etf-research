const NS = 'http://www.w3.org/2000/svg';
function el(name, attrs = {}) { const node = document.createElementNS(NS, name); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node; }

export function clearChart(target) { const root = typeof target === 'string' ? document.querySelector(target) : target; if (root) root.replaceChildren(); return root; }

export function lineChart(target, series, { percent = false, height = 320, colors = ['#4d6572', '#a98263', '#7b8e83'] } = {}) {
  const root = clearChart(target);
  if (!root) return;
  const width = Math.max(420, root.clientWidth || 640);
  const pad = { l: 48, r: 16, t: 18, b: 28 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const values = series.flatMap(item => item.values.map(point => Number(point.value))).filter(Number.isFinite);
  if (!values.length) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '研究時間序列圖' });
  for (let index = 0; index < 5; index += 1) {
    const y = pad.t + index * innerH / 4;
    svg.appendChild(el('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, stroke: '#deded8' }));
    const value = max - (max - min) * index / 4;
    const label = el('text', { x: 4, y: y + 4, fill: '#777770', 'font-size': '11' });
    label.textContent = percent ? `${(value * 100).toFixed(1)}%` : value.toFixed(2);
    svg.appendChild(label);
  }
  series.forEach((item, seriesIndex) => {
    const points = item.values.map((point, index) => {
      const value = Number(point.value);
      const x = pad.l + index / Math.max(1, item.values.length - 1) * innerW;
      const y = Number.isFinite(value) ? pad.t + (max - value) / (max - min || 1) * innerH : pad.t + innerH;
      return `${x},${y}`;
    }).join(' ');
    svg.appendChild(el('polyline', { points, fill: 'none', stroke: colors[seriesIndex % colors.length], 'stroke-width': 2 }));
  });
  root.appendChild(svg);
  return svg;
}

export function drawdownChart(target, rows, options = {}) {
  let peak = 0;
  return lineChart(target, [{ values: rows.map(row => { peak = Math.max(peak, row.nav); return { value: row.nav / peak - 1 }; }) }], { ...options, percent: true });
}

export function heatmap(target, matrix, { labels = [], columns = [], height = 260 } = {}) {
  const root = clearChart(target);
  if (!root) return;
  const width = Math.max(500, root.clientWidth || 700);
  const left = 90;
  const top = 26;
  const cellW = (width - left - 12) / Math.max(1, columns.length);
  const cellH = (height - top - 12) / Math.max(1, matrix.length);
  const all = matrix.flat().map(Number).filter(Number.isFinite);
  if (!all.length) return;
  const max = Math.max(...all);
  const min = Math.min(...all);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '月度報酬熱力圖' });
  columns.forEach((label, index) => {
    const text = el('text', { x: left + index * cellW + cellW / 2, y: 16, 'text-anchor': 'middle', fill: '#777770', 'font-size': '11' });
    text.textContent = label;
    svg.appendChild(text);
  });
  matrix.forEach((row, rowIndex) => {
    const label = el('text', { x: left - 8, y: top + rowIndex * cellH + cellH / 2 + 4, 'text-anchor': 'end', fill: '#777770', 'font-size': '11' });
    label.textContent = labels[rowIndex] || '';
    svg.appendChild(label);
    row.forEach((rawValue, columnIndex) => {
      const value = Number(rawValue);
      const missing = !Number.isFinite(value);
      const ratio = missing ? 0 : (value - min) / (max - min || 1);
      const fill = missing ? '#f4f4f0' : `rgb(${Math.round(245 - 80 * ratio)},${Math.round(242 - 42 * ratio)},${Math.round(237 - 26 * ratio)})`;
      svg.appendChild(el('rect', { x: left + columnIndex * cellW + 1, y: top + rowIndex * cellH + 1, width: cellW - 2, height: cellH - 2, fill, stroke: '#fff' }));
      if (!missing) {
        const text = el('text', { x: left + columnIndex * cellW + cellW / 2, y: top + rowIndex * cellH + cellH / 2 + 4, 'text-anchor': 'middle', fill: '#44443f', 'font-size': '11' });
        text.textContent = value.toFixed(2);
        svg.appendChild(text);
      }
    });
  });
  root.appendChild(svg);
  return svg;
}
