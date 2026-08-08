const tableBody = document.querySelector("#table");

if (tableBody) {
  const tableWrap = tableBody.closest(".table-wrap");
  const cards = document.createElement("section");
  cards.className = "compare-mobile-cards";
  cards.setAttribute("aria-label", "手機版策略比較卡");
  tableWrap?.classList.add("compare-results-table");
  tableWrap?.before(cards);

  const renderCards = () => {
    cards.replaceChildren();
    const rows = [...tableBody.querySelectorAll("tr")].filter((row) => row.dataset.cagr);
    if (!rows.length) return;
    rows.forEach((row) => {
      const cells = [...row.children].map((cell) => cell.textContent.trim());
      const card = document.createElement("article");
      card.className = "compare-strategy-card";
      const heading = document.createElement("div");
      heading.className = "compare-strategy-card__heading";
      const name = document.createElement("h3");
      name.textContent = cells[0] || "未命名策略";
      const status = document.createElement("span");
      status.className = "status" + (cells[1] === "verified" ? " good" : " warn");
      status.textContent = cells[1] || "未標示";
      heading.append(name, status);
      const period = document.createElement("p");
      period.className = "compare-strategy-card__period";
      period.textContent = `${cells[2] || "—"} 至 ${cells[3] || "—"}｜${cells[4] || "0"} 筆觀測`;
      const metrics = document.createElement("dl");
      metrics.className = "compare-strategy-card__metrics";
      [["CAGR", cells[5]], ["波動率", cells[6]], ["Sharpe", cells[7]], ["最大回撤", cells[8]], ["期末 NAV", cells[9]]].forEach(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const definition = document.createElement("dd");
        definition.textContent = value || "—";
        metrics.append(term, definition);
      });
      card.append(heading, period, metrics);
      cards.append(card);
    });
  };

  new MutationObserver(renderCards).observe(tableBody, { childList: true, subtree: true });
  renderCards();
}
