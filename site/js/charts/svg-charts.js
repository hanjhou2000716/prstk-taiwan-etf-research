const NS = "http://www.w3.org/2000/svg";
const DEFAULT_COLORS = ["#4d6572", "#a98263", "#7b8e83", "#8d6e63", "#6d7d99"];

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function element(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizedSeries(series) {
  return (Array.isArray(series) ? series : []).map((item, index) => ({
    sourceIndex: index,
    name: item?.name || item?.strategyName || item?.strategyId || `研究序列 ${index + 1}`,
    type: item?.type || "strategy",
    unit: item?.unit || "value",
    benchmark: Boolean(item?.benchmark || item?.type === "benchmark"),
    values: (Array.isArray(item?.values) ? item.values : []).map((point, pointIndex) => ({
      date: point?.date || String(pointIndex + 1),
      value: Number(point?.value),
    })),
  }));
}

function button(label, className = "") {
  const node = document.createElement("button");
  node.type = "button";
  node.className = `chart-control ${className}`.trim();
  node.textContent = label;
  return node;
}

function addDescription(root, title, description) {
  const heading = document.createElement("p");
  heading.className = "u-visually-hidden";
  heading.textContent = `${title}：${description}`;
  root.append(heading);
}

function addDataTable(root, series, percent) {
  const toggle = button("顯示資料表", "chart-control--table");
  toggle.setAttribute("aria-expanded", "false");
  const table = document.createElement("table");
  table.className = "chart-data-table";
  table.hidden = true;
  const caption = document.createElement("caption");
  caption.textContent = "圖表資料表";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["日期", ...series.map((item) => item.name)].forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  });
  head.append(headRow);
  const body = document.createElement("tbody");
  const length = Math.max(0, ...series.map((item) => item.values.length));
  for (let index = 0; index < length; index += 1) {
    const row = document.createElement("tr");
    const date = document.createElement("th");
    date.scope = "row";
    date.textContent = series.find((item) => item.values[index])?.values[index]?.date || String(index + 1);
    row.append(date);
    series.forEach((item) => {
      const cell = document.createElement("td");
      const value = item.values[index]?.value;
      cell.textContent = finite(value) ? (percent ? `${(value * 100).toFixed(2)}%` : Number(value).toFixed(4)) : "—";
      row.append(cell);
    });
    body.append(row);
  }
  table.append(caption, head, body);
  toggle.addEventListener("click", () => {
    table.hidden = !table.hidden;
    toggle.setAttribute("aria-expanded", String(!table.hidden));
    toggle.textContent = table.hidden ? "顯示資料表" : "隱藏資料表";
  });
  const details = document.createElement("div");
  details.className = "chart-details";
  details.append(toggle, table);
  root.append(details);
}

function renderLine(root, allSeries, options, state) {
  const series = allSeries.filter((_, index) => !state.hidden.has(index));
  const width = Math.max(240, Math.floor(root.clientWidth || 640));
  const height = options.height || 320;
  const pad = { left: 54, right: 18, top: 22, bottom: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxLength = Math.max(0, ...series.map((item) => item.values.length));
  const start = Math.min(state.start, Math.max(0, maxLength - 2));
  const end = Math.min(maxLength, Math.max(start + 2, state.end));
  const windowSeries = series.map((item) => ({ ...item, values: item.values.slice(start, end) }));
  const values = windowSeries.flatMap((item) => item.values.map((point) => point.value)).filter(finite);
  const stage = root.querySelector(".chart-stage") || root;
  stage.querySelector(".chart-plot")?.remove();
  if (!values.length) return;
  const logScale = state.scale === "log" && values.every((value) => value > 0);
  const transform = (value) => logScale ? Math.log(value) : value;
  const transformed = values.map(transform);
  const min = Math.min(...transformed);
  const max = Math.max(...transformed);
  const range = max - min || 1;
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": options.ariaLabel || "時間序列圖",
  });
  const title = svgElement("title");
  title.textContent = options.ariaLabel || "時間序列圖";
  const description = svgElement("desc");
  description.textContent = "使用日期游標查看各序列的數值；資料表可供鍵盤與輔助工具閱讀。";
  svg.append(title, description);
  const yValue = (index) => max - (max - min) * index / 4;
  for (let index = 0; index < 5; index += 1) {
    const y = pad.top + index * innerH / 4;
    svg.append(svgElement("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y, stroke: "#deded8" }));
    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", "4");
    label.setAttribute("y", String(y + 4));
    label.setAttribute("fill", "#777770");
    label.setAttribute("font-size", "11");
    const raw = logScale ? Math.exp(yValue(index)) : yValue(index);
    label.textContent = options.percent ? `${(raw * 100).toFixed(1)}%` : raw.toFixed(2);
    svg.append(label);
  }
  const pointX = (index, length) => pad.left + index / Math.max(1, length - 1) * innerW;
  const pointY = (value) => pad.top + (max - transform(value)) / range * innerH;
  windowSeries.forEach((item, seriesIndex) => {
    const points = item.values.filter((point) => finite(point.value)).map((point) => {
      const index = item.values.indexOf(point);
      return `${pointX(index, item.values.length)},${pointY(point.value)}`;
    }).join(" ");
    svg.append(svgElement("polyline", {
      points,
      fill: "none",
      stroke: options.colors[item.sourceIndex % options.colors.length] || DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length],
      "stroke-width": 2,
      "vector-effect": "non-scaling-stroke",
    }));
  });
  const crosshair = svgElement("line", { x1: pad.left, x2: pad.left, y1: pad.top, y2: height - pad.bottom, stroke: "#54544e", "stroke-dasharray": "3 3", visibility: "hidden" });
  const overlay = svgElement("rect", { x: pad.left, y: pad.top, width: innerW, height: innerH, fill: "transparent", tabindex: 0, role: "application", "aria-label": "圖表日期游標" });
  svg.append(crosshair, overlay);
  const plot = document.createElement("div");
  plot.className = "chart-plot";
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  const showPoint = (event) => {
    const bounds = svg.getBoundingClientRect();
    const localX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * width;
    const index = Math.max(0, Math.min(end - start - 1, Math.round((localX - pad.left) / innerW * Math.max(1, end - start - 1))));
    const x = pointX(index, Math.max(2, end - start));
    crosshair.setAttribute("x1", String(x));
    crosshair.setAttribute("x2", String(x));
    crosshair.setAttribute("visibility", "visible");
    const date = windowSeries.find((item) => item.values[index])?.values[index]?.date || String(index + start + 1);
    tooltip.replaceChildren();
    const dateLine = document.createElement("strong");
    dateLine.textContent = date;
    tooltip.append(dateLine);
    const formatValue = (item, value) => {
      if (!finite(value)) return "—";
      if (options.percent || item.unit === "percent" || item.type === "drawdown") return `${(value * 100).toFixed(2)}%`;
      return value.toFixed(4);
    };
    const primary = windowSeries.find((item) => !item.benchmark) || windowSeries[0];
    const benchmark = windowSeries.find((item) => item.benchmark);
    windowSeries.forEach((item) => {
      const line = document.createElement("span");
      const value = item.values[index]?.value;
      line.textContent = `${item.name}：${formatValue(item, value)}`;
      tooltip.append(line);
    });
    if (primary && primary.unit === "nav") {
      const value = primary.values[index]?.value;
      if (finite(value)) {
        const returnLine = document.createElement("span");
        returnLine.textContent = `累積報酬：${((value - 1) * 100).toFixed(2)}%`;
        tooltip.append(returnLine);
      }
    }
    if (benchmark && primary) {
      const strategyValue = primary.values[index]?.value;
      const benchmarkValue = benchmark.values[index]?.value;
      if (finite(strategyValue) && finite(benchmarkValue) && benchmarkValue !== 0) {
        const excessLine = document.createElement("span");
        excessLine.textContent = `相對 ${benchmark.name}：${(((strategyValue / benchmarkValue) - 1) * 100).toFixed(2)}%`;
        tooltip.append(excessLine);
      }
    }
    tooltip.hidden = false;
  };
  overlay.addEventListener("pointermove", showPoint);
  overlay.addEventListener("focus", (event) => showPoint({ clientX: event.clientX || 0, clientY: event.clientY || 0 }));
  overlay.addEventListener("pointerleave", () => { tooltip.hidden = true; crosshair.setAttribute("visibility", "hidden"); });
  plot.append(svg, tooltip);
  stage.append(plot);
}

export function clearChart(target) {
  const root = element(target);
  if (root) {
    root.__chartCleanup?.();
    root.__chartCleanup = null;
    root.replaceChildren();
  }
  return root;
}

export function lineChart(target, inputSeries, { percent = false, height = 320, colors = DEFAULT_COLORS, ariaLabel = "時間序列圖", capabilities = {} } = {}) {
  const root = clearChart(target);
  if (!root) return;
  const series = normalizedSeries(inputSeries);
  root.classList.add("chart-interactive", "chart-shell");
  addDescription(root, ariaLabel, "可用圖例切換序列，並使用日期游標查看資料。");
  const chartCapabilities = { range: true, logScale: true, legend: true, table: true, tooltip: true, ...capabilities };
  const controls = document.createElement("div");
  controls.className = "chart-controls";
  const scaleButton = button("切換對數尺度");
  const zoomButton = button("放大最近區間");
  const resetButton = button("重設範圍");
  controls.append(scaleButton, zoomButton, resetButton);
  scaleButton.hidden = !chartCapabilities.logScale;
  zoomButton.hidden = !chartCapabilities.range;
  resetButton.hidden = !chartCapabilities.range;
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.hidden = !chartCapabilities.legend;
  const state = { hidden: new Set(), start: 0, end: Math.max(2, ...series.map((item) => item.values.length)), scale: "linear" };
  series.forEach((item, index) => {
    const toggle = button(item.name, "chart-legend__item");
    toggle.style.setProperty("--chart-color", colors[index % colors.length]);
    toggle.setAttribute("aria-pressed", "true");
    toggle.addEventListener("click", () => {
      if (state.hidden.has(index)) state.hidden.delete(index); else state.hidden.add(index);
      toggle.setAttribute("aria-pressed", String(!state.hidden.has(index)));
      renderLine(root, series, { percent, height, colors, ariaLabel }, state);
    });
    legend.append(toggle);
  });
  scaleButton.addEventListener("click", () => {
    state.scale = state.scale === "linear" ? "log" : "linear";
    scaleButton.setAttribute("aria-pressed", String(state.scale === "log"));
    renderLine(root, series, { percent, height, colors, ariaLabel }, state);
  });
  zoomButton.addEventListener("click", () => {
    const length = Math.max(2, ...series.map((item) => item.values.length));
    state.start = Math.floor(length / 2);
    state.end = length;
    renderLine(root, series, { percent, height, colors, ariaLabel }, state);
  });
  resetButton.addEventListener("click", () => {
    state.start = 0;
    state.end = Math.max(2, ...series.map((item) => item.values.length));
    renderLine(root, series, { percent, height, colors, ariaLabel }, state);
  });
  const stage = document.createElement("div");
  stage.className = "chart-stage";
  root.append(controls, legend, stage);
  if (chartCapabilities.table) addDataTable(root, series, percent);
  const render = () => renderLine(root, series, { percent, height, colors, ariaLabel }, state);
  render();
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(render) : null;
  observer?.observe(root);
  root.__chartCleanup = () => observer?.disconnect();
  return root.querySelector("svg");
}

export function drawdownChart(target, rows, options = {}) {
  let peak = 0;
  const values = (rows || []).map((row) => {
    peak = Math.max(peak, Number(row.nav));
    return { date: row.date, value: peak > 0 ? Number(row.nav) / peak - 1 : 0 };
  });
  return lineChart(target, [{ name: "回撤", values }], { ...options, percent: true, ariaLabel: "水下回撤圖" });
}

export function heatmap(target, matrix, { labels = [], columns = [], height = 260 } = {}) {
  const root = clearChart(target);
  if (!root) return;
  const width = Math.max(260, Math.floor(root.clientWidth || 700));
  const left = 90;
  const top = 26;
  const cellW = (width - left - 12) / Math.max(1, columns.length);
  const cellH = (height - top - 12) / Math.max(1, matrix.length);
  const all = matrix.flat().map(Number).filter(Number.isFinite);
  if (!all.length) return;
  const max = Math.max(...all);
  const min = Math.min(...all);
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "報酬熱力圖" });
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip chart-tooltip--heatmap";
  tooltip.hidden = true;
  const plot = document.createElement("div");
  plot.className = "chart-plot";
  columns.forEach((label, index) => {
    const text = svgElement("text", { x: left + index * cellW + cellW / 2, y: 16, "text-anchor": "middle", fill: "#777770", "font-size": 11 });
    text.textContent = label;
    svg.append(text);
  });
  matrix.forEach((row, rowIndex) => {
    const label = svgElement("text", { x: left - 8, y: top + rowIndex * cellH + cellH / 2 + 4, "text-anchor": "end", fill: "#777770", "font-size": 11 });
    label.textContent = labels[rowIndex] || "";
    svg.append(label);
    row.forEach((rawValue, columnIndex) => {
      const value = Number(rawValue);
      const missing = !Number.isFinite(value);
      const ratio = missing ? 0 : (value - min) / (max - min || 1);
      const fill = missing ? "#f4f4f0" : `rgb(${Math.round(245 - 80 * ratio)},${Math.round(242 - 42 * ratio)},${Math.round(237 - 26 * ratio)})`;
      const cell = svgElement("rect", { x: left + columnIndex * cellW + 1, y: top + rowIndex * cellH + 1, width: cellW - 2, height: cellH - 2, fill, stroke: "#fff", tabindex: missing ? -1 : 0, role: missing ? "presentation" : "img" });
      if (!missing) {
        cell.addEventListener("focus", () => {
          tooltip.textContent = `${labels[rowIndex] || ""}／${columns[columnIndex] || ""}：${value.toFixed(2)}%`;
          tooltip.hidden = false;
        });
        cell.addEventListener("blur", () => { tooltip.hidden = true; });
        const text = svgElement("text", { x: left + columnIndex * cellW + cellW / 2, y: top + rowIndex * cellH + cellH / 2 + 4, "text-anchor": "middle", fill: "#44443f", "font-size": 11 });
        text.textContent = value.toFixed(2);
        svg.append(cell, text);
      } else svg.append(cell);
    });
  });
  plot.append(svg, tooltip);
  const stage = document.createElement("div");
  stage.className = "chart-stage";
  stage.append(plot);
  root.append(stage);
  let lastWidth = width;
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    const nextWidth = Math.max(260, Math.floor(root.clientWidth || 700));
    if (Math.abs(nextWidth - lastWidth) < 1) return;
    lastWidth = nextWidth;
    heatmap(target, matrix, { labels, columns, height });
  }) : null;
  observer?.observe(root);
  root.__chartCleanup = () => observer?.disconnect();
  return svg;
}
