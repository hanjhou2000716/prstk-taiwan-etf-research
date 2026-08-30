const navigationUrl = new URL("../../data/navigation.json", import.meta.url);
let navigationPromise;

export function loadNavigation() {
  navigationPromise ??= fetch(navigationUrl)
    .then((response) => {
      if (!response.ok) throw new Error("navigation.json HTTP " + response.status);
      return response.json();
    });
  return navigationPromise;
}

export function currentPage() {
  const path = window.location.pathname.split("/").filter(Boolean);
  return path.at(-1) || "index.html";
}

export function isCurrentPage(href, page = currentPage()) {
  return href === page || (page === "" && href === "index.html");
}

function linkNode(item, page) {
  const link = document.createElement("a");
  link.href = item.href;
  link.textContent = item.label;
  if (item.description) {
    link.dataset.description = item.description;
    link.setAttribute("aria-label", item.label + "：" + item.description);
  }
  if (isCurrentPage(item.href, page)) {
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
  }
  return link;
}

function groupNode(group, page) {
  const details = document.createElement("details");
  details.className = "nav-menu";
  const active = group.items.some((item) => isCurrentPage(item.href, page));
  if (active) details.classList.add("has-active");

  const summary = document.createElement("summary");
  summary.textContent = group.label;
  summary.setAttribute("aria-label", group.label + "選單");
  summary.setAttribute("aria-expanded", "false");
  details.addEventListener("toggle", () => summary.setAttribute("aria-expanded", String(details.open)));
  details.append(summary);

  const panel = document.createElement("div");
  panel.className = "nav-menu-panel";
  const eyebrow = document.createElement("span");
  eyebrow.className = "nav-menu-eyebrow";
  eyebrow.textContent = group.eyebrow;
  panel.append(eyebrow);
  for (const item of group.items) {
    const link = linkNode(item, page);
    link.classList.add("nav-menu-link");
    panel.append(link);
  }
  details.append(panel);
  return details;
}

function wireExclusiveMenus(nav) {
  const menus = [...nav.querySelectorAll("details.nav-menu")];
  const sync = () => {
    for (const details of menus) {
      const summary = details.querySelector("summary");
      summary?.setAttribute("aria-expanded", String(details.open));
    }
  };
  for (const details of menus) {
    const summary = details.querySelector("summary");
    summary?.addEventListener("click", (event) => {
      event.preventDefault();
      const willOpen = !details.open;
      if (willOpen) {
        for (const other of menus) {
          if (other !== details) other.open = false;
        }
      }
      details.open = willOpen;
      sync();
    });
    details.addEventListener("toggle", () => {
      if (details.open) {
        for (const other of menus) {
          if (other !== details) other.open = false;
        }
      }
      sync();
    });
  }
  sync();
}

export function createNavigation(config, page = currentPage()) {
  const nav = document.createElement("nav");
  nav.id = "site-navigation";
  nav.className = "nav";
  nav.setAttribute("aria-label", "主要導覽");
  for (const item of config.primary) nav.append(linkNode(item, page));
  for (const group of config.groups) nav.append(groupNode(group, page));
  wireExclusiveMenus(nav);
  return nav;
}

export function createSecondaryNavigation(config, page = currentPage()) {
  const nav = document.createElement("nav");
  nav.className = "lab-secondary-nav";
  nav.setAttribute("aria-label", "研究實驗室次導覽");
  for (const item of config.secondary) nav.append(linkNode(item, page));
  return nav;
}
