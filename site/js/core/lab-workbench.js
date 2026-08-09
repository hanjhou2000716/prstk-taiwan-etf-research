const layout = document.querySelector(".lab-layout");

if (layout) {
  const parameters = layout.querySelector("aside");
  const results = layout.querySelector(":scope > section");
  const summary = layout.querySelector(".metric-grid")?.closest(".card");
  const chartPanels = [...layout.querySelectorAll(".chart-panel")];
  const charts = chartPanels[0];
  const risk = chartPanels[1] || chartPanels[0];
  const riskTarget = risk === charts ? "lab-charts" : "lab-risk";

  layout.dataset.labShell = "true";
  layout.dataset.labView = "summary";
  parameters?.setAttribute("data-lab-panel", "parameters");
  results?.setAttribute("data-lab-panel", "results");
  parameters?.setAttribute("role", "dialog");
  const isMobile = () => window.matchMedia("(max-width: 820px)").matches;
  parameters?.setAttribute("aria-modal", String(isMobile()));
  parameters?.setAttribute("aria-hidden", "false");
  const parametersHeading = parameters?.querySelector("h2");
  if (parameters && !parametersHeading?.id) parametersHeading?.setAttribute("id", "lab-parameters-title");
  if (parametersHeading?.id) parameters?.setAttribute("aria-labelledby", parametersHeading.id);
  if (parameters && !parameters.querySelector(".lab-parameters-close")) {
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "button secondary lab-parameters-close";
    closeButton.setAttribute("aria-label", "關閉參數設定");
    closeButton.textContent = "關閉參數";
    parameters.prepend(closeButton);
    closeButton.addEventListener("click", () => {
      const returnFocus = lastFocusedElement;
      activate("summary", "lab-summary");
      (returnFocus instanceof HTMLElement ? returnFocus : document.getElementById("lab-tab-summary"))?.focus({ preventScroll: true });
      lastFocusedElement = null;
    });
  }
  summary?.setAttribute("id", "lab-summary");
  charts?.setAttribute("id", "lab-charts");
  if (risk && risk !== charts) risk.setAttribute("id", "lab-risk");

  const tabs = document.createElement("nav");
  tabs.className = "lab-mobile-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "研究工作台區塊");
  const items = [
    ["summary", "摘要", "lab-summary"],
    ["charts", "圖表", "lab-charts"],
    ["risk", "風險", riskTarget],
    ["parameters", "參數", "lab-parameters"],
  ];

  let lastFocusedElement = null;

  const activate = (view, targetId) => {
    layout.dataset.labView = view;
    const parameterView = view === "parameters";
    document.body.classList.toggle("lab-parameters-open", parameterView);
    parameters?.setAttribute("aria-hidden", String(isMobile() && !parameterView));
    parameters?.setAttribute("aria-modal", String(isMobile()));
    tabs.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.labView === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (view !== "parameters") {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      parameters?.querySelector("input, select, button:not(.lab-parameters-close)")?.focus({ preventScroll: true });
    }
  };

  items.forEach(([view, label, targetId], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lab-mobile-tab";
    button.dataset.labView = view;
    button.id = `lab-tab-${view}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", targetId);
    button.setAttribute("aria-selected", String(index === 0));
    button.tabIndex = index === 0 ? 0 : -1;
    button.textContent = label;
    button.addEventListener("click", () => {
      if (view === "parameters") lastFocusedElement = document.activeElement;
      activate(view, targetId);
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "ArrowRight" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      tabs.querySelectorAll("button")[next].focus();
      activate(items[next][0], items[next][2]);
    });
    tabs.append(button);
  });

  layout.before(tabs);
  parameters?.setAttribute("id", "lab-parameters");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && layout.dataset.labView === "parameters") {
      activate("summary", "lab-summary");
      (lastFocusedElement instanceof HTMLElement ? lastFocusedElement : tabs.querySelector('[data-lab-view="summary"]'))?.focus({ preventScroll: true });
      lastFocusedElement = null;
    }
  });
  window.addEventListener("resize", () => {
    parameters?.setAttribute("aria-modal", String(isMobile()));
    parameters?.setAttribute("aria-hidden", String(isMobile() && layout.dataset.labView !== "parameters"));
    if (!isMobile()) document.body.classList.remove("lab-parameters-open");
  });
}
