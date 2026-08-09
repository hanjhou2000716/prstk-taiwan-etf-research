const replacements = {
  "builder.html": "research-lab.html",
  "dashboard.html": "compare.html",
  "horizons.html": "research-lab.html",
  "proposal.html": "methodology.html",
};

const page = window.location.pathname.split("/").filter(Boolean).at(-1) || "index.html";
const destination = replacements[page];
if (destination) {
  const banner = document.createElement("aside");
  banner.className = "legacy-archive-banner";
  banner.setAttribute("role", "note");
  const title = document.createElement("strong");
  title.textContent = "舊版研究頁面";
  const message = document.createElement("span");
  message.textContent = "此頁保留作為歷史連結；新的研究流程已移至：";
  const link = document.createElement("a");
  link.href = destination;
  link.textContent = destination === "methodology.html" ? "資料與方法" : destination === "compare.html" ? "策略比較" : "研究實驗室";
  link.setAttribute("aria-label", `前往新版 ${link.textContent}`);
  banner.append(title, message, link);
  document.querySelector("main")?.prepend(banner);
}
