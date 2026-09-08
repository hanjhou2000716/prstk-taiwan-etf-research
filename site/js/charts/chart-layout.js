const DEFAULT_FONT_FAMILY = "Inter, ui-sans-serif, system-ui, sans-serif";

function fallbackTextWidth(value, fontSize) {
  return [...String(value)].reduce((total, character) => (
    total + (character.charCodeAt(0) > 255 ? fontSize : fontSize * 0.58)
  ), 0);
}

export function measureTextWidth(value, { fontSize = 11, fontWeight = 400, fontFamily = DEFAULT_FONT_FAMILY } = {}) {
  const text = String(value ?? "");
  if (typeof document === "undefined") return fallbackTextWidth(text, fontSize);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return fallbackTextWidth(text, fontSize);
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return context.measureText(text).width;
}

export function maxTextWidth(values, options = {}) {
  return Math.max(0, ...values.map((value) => measureTextWidth(value, options)));
}

export function yAxisLayout({ tickLabels = [], axisTitle = "", minLeft = 54, tickFontSize = 11, axisFontSize = 12, gap = 8 } = {}) {
  const tickWidth = maxTextWidth(tickLabels, { fontSize: tickFontSize });
  const titleFootprint = axisTitle ? axisFontSize : 0;
  const left = Math.max(
    minLeft,
    Math.ceil(tickWidth + 8 + gap + titleFootprint + 4),
  );
  return {
    left,
    tickX: left - 8,
    tickWidth,
    axisTitleX: axisTitle ? axisFontSize + 6 : null,
    axisFontSize,
  };
}

export function evenlySpacedTicks(min, max, count = 5) {
  const safeCount = Math.max(2, Math.floor(count));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return Array.from({ length: safeCount }, () => min);
  return Array.from({ length: safeCount }, (_, index) => (
    min + ((max - min) * index / (safeCount - 1))
  ));
}

export function responsiveTickCount(innerWidth, labelWidth, { min = 3, max = 5, gap = 8 } = {}) {
  const estimated = Math.floor((Math.max(0, innerWidth) + gap) / Math.max(1, labelWidth + gap));
  return Math.max(min, Math.min(max, estimated));
}
