const SVG_NS = "http://www.w3.org/2000/svg";
const COLORS = {
  actual_etf: "#596a5b",
  synthetic_2x_proxy: "#657585",
  synthetic_proxy: "#657585",
  experimental: "#876f52",
};

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function finiteRows(rows) {
  return rows.filter((row) => (
    Number.isFinite(Number(row.metrics?.cagr))
    && Number.isFinite(Number(row.metrics?.beta_beta))
    && Number.isFinite(Number(row.metrics?.max_drawdown))
  ));
}

function numberFormat(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function pctFormat(value) {
  return (Number(value) * 100).toFixed(2) + "%";
}

function dataTypeLabel(value) {
  return value === "actual_etf" ? "Actual ETF"
    : String(value).includes("synthetic") ? "Synthetic Proxy"
      : "Experimental";
}

function strategyHref(strategyId) {
  return "research-lab.html?strategy=" + encodeURIComponent(strategyId);
}

export function renderRiskMap(target, rows) {
  target.__riskMapCleanup?.();
  target.__riskMapCleanup = null;
  target.replaceChildren();
  const validRows = finiteRows(rows);
  if (!validRows.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "目前沒有足夠的 Beta、CAGR 與回撤資料可繪製風險圖。";
    target.append(empty);
    return;
  }

  const width = Math.max(320, Math.floor(target.clientWidth || 820));
  const height = 390;
  const pad = { left: 62, right: 24, top: 24, bottom: 48 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const xValues = validRows.map((row) => Number(row.metrics.beta_beta));
  const yValues = validRows.map((row) => Number(row.metrics.cagr));
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const xPad = Math.max(.08, (xMax - xMin) * .12);
  const yPad = Math.max(.02, (yMax - yMin) * .14);
  const xScale = (value) => pad.left + ((value - (xMin - xPad)) / ((xMax + xPad) - (xMin - xPad))) * innerWidth;
  const yScale = (value) => pad.top + (1 - ((value - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad)))) * innerHeight;

  const figure = document.createElement("figure");
  figure.className = "risk-map-figure";
  const svg = svgElement("svg", {
    viewBox: "0 0 " + width + " " + height,
    role: "img",
    "aria-labelledby": "risk-map-title risk-map-description",
  });
  const title = svgElement("title", { id: "risk-map-title" });
  title.textContent = "Beta、CAGR 與最大回撤風險圖";
  const description = svgElement("desc", { id: "risk-map-description" });
  description.textContent = "橫軸為 Beta，縱軸為 CAGR，圓點大小代表最大回撤幅度；點擊策略可進入研究實驗室。";
  svg.append(title, description);

  for (let index = 0; index < 5; index += 1) {
    const ratio = index / 4;
    const y = pad.top + ratio * innerHeight;
    const value = yMax + yPad - ratio * ((yMax + yPad) - (yMin - yPad));
    svg.append(svgElement("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: y,
      y2: y,
      stroke: "#deded8",
    }));
    const label = svgElement("text", {
      x: pad.left - 9,
      y: y + 4,
      "text-anchor": "end",
      fill: "#777772",
      "font-size": 11,
    });
    label.textContent = pctFormat(value);
    svg.append(label);
  }
  for (let index = 0; index < 5; index += 1) {
    const ratio = index / 4;
    const x = pad.left + ratio * innerWidth;
    const value = xMin - xPad + ratio * ((xMax + xPad) - (xMin - xPad));
    svg.append(svgElement("line", {
      x1: x,
      x2: x,
      y1: pad.top,
      y2: height - pad.bottom,
      stroke: "#eeeeea",
    }));
    const label = svgElement("text", {
      x,
      y: height - pad.bottom + 20,
      "text-anchor": "middle",
      fill: "#777772",
      "font-size": 11,
    });
    label.textContent = numberFormat(value, 2);
    svg.append(label);
  }
  const xAxis = svgElement("text", {
    x: pad.left + innerWidth / 2,
    y: height - 7,
    "text-anchor": "middle",
    fill: "#54544e",
    "font-size": 12,
  });
  xAxis.textContent = "Beta";
  const yAxis = svgElement("text", {
    x: 14,
    y: pad.top + innerHeight / 2,
    "text-anchor": "middle",
    fill: "#54544e",
    "font-size": 12,
    transform: "rotate(-90 14 " + (pad.top + innerHeight / 2) + ")",
  });
  yAxis.textContent = "CAGR";
  svg.append(xAxis, yAxis);

  for (const entry of validRows) {
    const metrics = entry.metrics;
    const strategy = entry.strategy;
    const category = entry.category || strategy.data_type;
    const drawdownMagnitude = Math.abs(Number(metrics.max_drawdown));
    const radius = 7 + Math.min(13, drawdownMagnitude * 18);
    const circle = svgElement("circle", {
      cx: xScale(Number(metrics.beta_beta)),
      cy: yScale(Number(metrics.cagr)),
      r: radius,
      fill: COLORS[category] || COLORS.experimental,
      "fill-opacity": .82,
      stroke: "#fff",
      "stroke-width": 2,
      tabindex: 0,
      role: "link",
      "aria-label": strategy.display_name + "，CAGR " + pctFormat(metrics.cagr) + "，Beta " + numberFormat(metrics.beta_beta) + "，最大回撤 " + pctFormat(metrics.max_drawdown),
    });
    const tooltip = svgElement("title");
    tooltip.textContent = strategy.display_name + "｜" + dataTypeLabel(category)
      + "｜CAGR " + pctFormat(metrics.cagr)
      + "｜Beta " + numberFormat(metrics.beta_beta)
      + "｜Max DD " + pctFormat(metrics.max_drawdown);
    circle.append(tooltip);
    const goToStrategy = () => { window.location.href = strategyHref(strategy.strategy_id); };
    circle.addEventListener("click", goToStrategy);
    circle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goToStrategy();
      }
    });
    svg.append(circle);
  }
  figure.append(svg);
  target.append(figure);

  const table = document.createElement("table");
  table.className = "risk-map-table";
  table.innerHTML = "<caption class=\"u-visually-hidden\">Beta、CAGR、最大回撤與資料類型</caption><thead><tr><th scope=\"col\">策略</th><th scope=\"col\">資料類型</th><th scope=\"col\">CAGR</th><th scope=\"col\">Beta</th><th scope=\"col\">Max DD</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const entry of validRows) {
    const row = document.createElement("tr");
    const link = document.createElement("a");
    link.href = strategyHref(entry.strategy.strategy_id);
    link.textContent = entry.strategy.display_name;
    const values = [
      link,
      dataTypeLabel(entry.category || entry.strategy.data_type),
      pctFormat(entry.metrics.cagr),
      numberFormat(entry.metrics.beta_beta),
      pctFormat(entry.metrics.max_drawdown),
    ];
    values.forEach((value) => {
      const cell = document.createElement("td");
      if (value && value.nodeType === 1) cell.append(value);
      else cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  }
  table.append(body);
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-scroll";
  tableWrap.append(table);
  target.append(tableWrap);
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => renderRiskMap(target, rows)) : null;
  observer?.observe(target);
  target.__riskMapCleanup = () => observer?.disconnect();
}
