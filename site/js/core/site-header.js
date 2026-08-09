import {
  createNavigation,
  createSecondaryNavigation,
  currentPage,
  loadNavigation,
} from "./site-navigation.js";
import "./lab-workbench.js?v=20260808-lab1";
import "../pages/compare-mobile.js?v=20260808-compare1";

const header = document.querySelector("[data-site-header], .site-header");
const designSystemUrl = new URL("../../styles/design-system.css?v=20260809-ui1", import.meta.url);

function loadDesignSystem() {
  if (document.querySelector("link[data-design-system], link[href*='styles/design-system.css']")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = designSystemUrl.href;
  link.dataset.designSystem = "true";
  document.head.append(link);
}

function createBrand(config) {
  const brand = document.createElement("a");
  brand.className = "brand-pair";
  brand.href = config.home;
  brand.setAttribute("aria-label", config.ariaLabel);

  const prstk = document.createElement("img");
  prstk.src = "assets/PRStK-Remove.png";
  prstk.alt = "PRStK";
  prstk.className = "brand-logo brand-logo-prstk";

  const divider = document.createElement("span");
  divider.className = "brand-divider";
  divider.setAttribute("aria-hidden", "true");
  divider.textContent = "|";

  const sfce = document.createElement("img");
  sfce.src = "assets/SFC.e-removebg-preview.png";
  sfce.alt = "SFC.e";
  sfce.className = "brand-logo brand-logo-sfce";

  const name = document.createElement("span");
  name.className = "brand-platform-name";
  const desktopName = document.createElement("span");
  desktopName.className = "brand-platform-name-desktop";
  desktopName.textContent = config.platformName;
  const mobileName = document.createElement("span");
  mobileName.className = "brand-platform-name-mobile";
  mobileName.textContent = config.mobilePlatformName || config.platformName;
  name.append(desktopName, mobileName);
  brand.append(prstk, divider, sfce, name);
  return brand;
}

function createHeader(config) {
  const page = currentPage();
  const inner = document.createElement("div");
  inner.className = "site-shell header-inner";
  inner.append(createBrand(config.brand));

  const menuButton = document.createElement("button");
  menuButton.className = "menu-toggle";
  menuButton.type = "button";
  menuButton.setAttribute("aria-label", "開啟主選單");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-controls", "site-navigation");
  menuButton.innerHTML = "<span class=\"menu-icon\" aria-hidden=\"true\">☰</span><span>選單</span>";
  inner.append(menuButton);

  const nav = createNavigation(config, page);
  inner.append(nav);
  return { inner, menuButton, nav };
}

function closeMenu(menuButton, nav) {
  nav.classList.remove("open");
  nav.querySelectorAll("details[open]").forEach((details) => { details.open = false; });
  document.body.classList.remove("nav-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "開啟主選單");
}

function openMenu(menuButton, nav) {
  nav.classList.add("open");
  document.body.classList.add("nav-open");
  menuButton.setAttribute("aria-expanded", "true");
  menuButton.setAttribute("aria-label", "關閉主選單");
  nav.querySelector("a, summary")?.focus();
}

function wireMenu(headerElement, menuButton, nav) {
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (nav.classList.contains("open")) closeMenu(menuButton, nav);
    else openMenu(menuButton, nav);
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu(menuButton, nav);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("open")) {
      closeMenu(menuButton, nav);
      menuButton.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!headerElement.contains(event.target) && nav.classList.contains("open")) closeMenu(menuButton, nav);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 820 && nav.classList.contains("open")) closeMenu(menuButton, nav);
  });
}

async function mountHeader() {
  if (!header) return;
  loadDesignSystem();
  try {
    const config = await loadNavigation();
    const { inner, menuButton, nav } = createHeader(config);
    header.replaceChildren(inner);
    wireMenu(header, menuButton, nav);
    const labPages = new Set(["composer.html", "research-lab.html", "beta-lab.html", "leverage-lab.html", "financing-lab.html", "risk-lab.html"]);
    if (labPages.has(currentPage())) {
      const main = document.querySelector("main");
      const secondary = createSecondaryNavigation(config);
      main?.insertBefore(secondary, main.firstElementChild?.nextElementSibling || null);
    }
  } catch (error) {
    header.dataset.navigationError = "true";
    console.error("Unable to mount shared navigation", error);
  }
}

mountHeader();
