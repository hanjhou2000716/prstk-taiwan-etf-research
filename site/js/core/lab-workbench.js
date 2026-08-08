const layout = document.querySelector(".lab-layout");

if (layout) {
  const parameters = layout.querySelector("aside");
  const results = layout.querySelector(":scope > section");
  const summary = layout.querySelector(".metric-grid")?.closest(".card");
  const charts = document.getElementById("equity")?.closest(".chart-panel");
  const risk = document.getElementById("dd")?.closest(".chart-panel");

  layout.dataset.labShell = "true";
  layout.dataset.labView = "summary";
  parameters?.setAttribute("data-lab-panel", "parameters");
  results?.setAttribute("data-lab-panel", "results");
  summary?.setAttribute("id", "lab-summary");
  charts?.setAttribute("id", "lab-charts");
  risk?.setAttribute("id", "lab-risk");

  const tabs = document.createElement("nav");
  tabs.className = "lab-mobile-tabs";
  tabs.setAttribute("aria-label", "研究工作台區塊");
  const items = [
    ["summary", "摘要", "lab-summary"],
    ["charts", "圖表", "lab-charts"],
    ["risk", "風險", "lab-risk"],
    ["parameters", "參數", "lab-parameters"],
  ];

  const activate = (view, targetId) => {
    layout.dataset.labView = view;
    tabs.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.labView === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (view !== "parameters") {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      parameters?.querySelector("input, select, button")?.focus({ preventScroll: true });
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
    button.addEventListener("click", () => activate(view, targetId));
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
}
