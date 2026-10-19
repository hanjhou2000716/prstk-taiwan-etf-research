import type { ResearchReportV1, ResearchRun, ReportBlock } from "./types.js";
const money = (value: unknown): string => typeof value === "number" && Number.isFinite(value) ? "NT$ " + Math.round(value).toLocaleString("en-US") : "無資料";
const pct = (value: unknown, digits = 2): string => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) + "%" : "無資料";
export function buildReport(run: ResearchRun): ResearchReportV1 {
  const bt = run.backtest, stats = bt?.stats || {}, alloc = run.allocation || {}, comparison = run.comparison;
  const survival = run.survival || [];
  const completed = survival.filter(row => row.result.completed && row.result.horizonCovered).length;
  const path = bt?.path || [];
  const step = Math.max(1, Math.ceil(path.length / 80));
  const chartPath = path.filter((_: any, i: number) => i === 0 || i === path.length - 1 || i % step === 0);
  const chartValues = chartPath.map((row: any) => Number(row.twrIndex)).filter(Number.isFinite);
  const monthEnds = new Map<string, any>();
  for (const row of path) monthEnds.set(String(row.date).slice(0, 7), row);
  let priorIndex = Number(path[0]?.twrIndex) || 1;
  const monthlyRows: string[][] = [];
  for (const [month, row] of monthEnds) {
    const currentIndex = Number(row.twrIndex);
    if (Number.isFinite(currentIndex) && priorIndex > 0) monthlyRows.push([month, pct((currentIndex / priorIndex - 1) * 100, 3)]);
    priorIndex = currentIndex;
  }
  const status: ResearchReportV1["status"] = bt?.ok ? (run.validationLayers.some(x => x.state === "failed") ? "partial" : "complete") : "failed";
  const rows = (items: Array<[string, string]>): string[][] => items.map(x => [x[0], x[1]]);
  const blocks: ReportBlock[] = [
    { id: "summary", title: "1｜研究摘要", status, narrative: [
      "研究情境：" + run.scenario.scenarioName,
      "實際行情期間：" + (run.actualPeriod.start || "無") + " 至 " + (run.actualPeriod.end || "無") + "，" + run.actualPeriod.sessions + " 個共同交易日。",
      "時間加權年化報酬 " + pct(stats.cagrPct) + "；最大回撤 " + pct(stats.mddPct) + "。",
      "五種生存情境完成 " + completed + " / " + survival.length + "（完成數不是存活機率）。"
    ] },
    { id: "allocation", title: "2｜配置與融資", narrative: [
      "自有資金 " + money(run.scenario.ownCapital) + "；初始借款 " + money(alloc.borrow) + "；融資年利率假設 " + pct(run.scenario.aprPct, 2) + "。",
      "此為單期配置模型，買進成本與開辦費已分開計入。借款持有部位不循環質押。"
    ], table: { headers: ["ETF", "自有權重", "借款權重", "質押設定", "模型額度"], rows: (alloc.legs || []).map((x: any) => [x.symbol, pct(x.ownWeightPct), pct(x.loanWeightPct), pct(x.pledgePct) + " / LTV " + pct(x.ltvPct), money(x.capacity)]) } },
    { id: "method", title: "3｜方法與證據", narrative: [
      "報酬模型：" + (bt?.version || "未執行") + "；價格性質：" + (bt?.priceGrade || "無資料") + "。",
      "報酬引擎以調整價格代理計算；生存引擎另採 T+2 觀察日結算代理，兩者不互相證明。",
      "資料稽核的 formal_conclusions_blocked = " + String(run.reference?.formal_conclusions_blocked ?? "未知") + "。"
    ], table: { headers: ["驗證層", "狀態", "說明"], rows: run.validationLayers.map(x => [x.key, x.state, x.detail]) } },
    { id: "returns", title: "4｜報酬研究", narrative: [
      "起始淨資產 " + money(stats.startNetAssetTwd) + "；結束淨資產 " + money(stats.endNetAssetTwd) + "。",
      "Sharpe " + (Number.isFinite(stats.sharpe) ? Number(stats.sharpe).toFixed(3) : "無資料") + "；Sortino " + (Number.isFinite(stats.sortino) ? Number(stats.sortino).toFixed(3) : "無資料") + "。",
      "期間外部現金流 " + money(stats.capitalInjectionsNetTwd) + "；借款利息支出 " + money(stats.interestPaidTwd) + "。",
      "同標的無借款基準沿用相同本金、外部現金流、交易成本與日期，並將借款動用及借款再投入設為 0；此基準不混入 A/B/C 排名。",
      "此序列不含完整配息總報酬，亦不代表真實融資執行。月報酬由時間加權指數逐月計算。"
    ], table: { headers: ["月份", "時間加權報酬"], rows: monthlyRows }, tables: [{
      headers: ["策略", "實際期間", "CAGR", "MDD", "Sharpe", "借款利息"],
      rows: [
        ["目前融資情境", bt.period.start + " 至 " + bt.period.end, pct(stats.cagrPct), pct(stats.mddPct), Number.isFinite(stats.sharpe) ? Number(stats.sharpe).toFixed(3) : "無資料", money(stats.interestPaidTwd)],
        [run.benchmark.name, run.benchmark.backtest.period.start + " 至 " + run.benchmark.backtest.period.end, pct(run.benchmark.backtest.stats.cagrPct), pct(run.benchmark.backtest.stats.mddPct), Number.isFinite(run.benchmark.backtest.stats.sharpe) ? Number(run.benchmark.backtest.stats.sharpe).toFixed(3) : "無資料", money(run.benchmark.backtest.stats.interestPaidTwd)]
      ]
    }] },
    { id: "comparison", title: "5｜公平比較", narrative: comparison ? [
      "A/B/C 共同本金 " + money(comparison.ownCapital) + "；共同外部現金流 " + money(comparison.monthlyFreeCashFlow) + " / 月。",
      "共同日期 " + comparison.period.start + " 至 " + comparison.period.end + "；完整期間排名：" + (comparison.rankingEligible ? "可比較" : "已停用，至少一個方案中斷或期間不完整") + "。"
    ] : ["尚未完成 A/B/C 三方案同期計算；不可產生跨方案績效排名。"], table: comparison ? { headers: ["方案", "期間", "CAGR", "MDD", "Sharpe", "狀態"], rows: comparison.results.map((x: any) => [x.name, x.period.start + " 至 " + x.period.end, comparison.rankingEligible ? pct(x.comparableCagrPct) : "不排名", pct(x.stats.mddPct), comparison.rankingEligible ? String(x.stats.sharpe?.toFixed(3) ?? "無資料") : "不排名", x.fullPeriod ? "完整" : "中斷"]) } : undefined },
    { id: "survival", title: "6｜生存分析", narrative: [
      "生存模型包含獨立的 T+2 應收款、限制現金、利息、到期本金及條件續借處理。",
      "研究期間未涵蓋完整要求月數時，標示為資料不足，不延伸曲線。條件續借不代表核准。"
    ], tables: [
      { headers: ["情境", "期間完成", "首次硬性失敗", "首次低於維持率門檻", "首次低於預備金", "應付利息", "未償本金"], rows: survival.map(x => [x.name, x.result.completed && x.result.horizonCovered ? "完整" : "未完整", x.result.firstHard?.date || "未觀察到", x.result.firstMargin || "未觀察到", x.result.firstReserve || "未觀察到", money(x.result.interestPaid), money(x.result.unpaidLoan)]) },
      { headers: ["日期", "事件", "金額／狀態"], rows: survival.flatMap(x => x.result.events.slice(0, 8).map((event: any) => [x.name + " · " + String(event.date || ""), String(event.type || "事件"), money(event.amount ?? event.required ?? event.ratioPct)] )).slice(0, 40) }
    ] },
    { id: "audit", title: "7｜一致性檢查", narrative: [
      "單期資金恆等式差額 " + money(alloc.accountingDifference) + "。",
      "每日生存帳務以持倉、流動現金、應收款、限制現金、未償本金及應計利息列示。",
      "每組資料保存 SHA-256 指紋供核對；指紋不等於來源認證。"
    ], table: { headers: ["事件", "狀態"], rows: [
      ["起始資金與費用平衡", Math.abs(alloc.accountingDifference || 0) < 0.01 ? "通過" : "失敗"],
      ["歷史期間完整", bt?.stats?.hardFailure ? "中斷" : "依資料覆蓋判定"],
      ["formal_conclusions_blocked", String(run.reference?.formal_conclusions_blocked ?? "未知")]
    ] } },
    { id: "sources", title: "8｜來源與限制附錄", narrative: [
      "應用版本 " + run.appVersion + "；投資模型 " + run.modelVersions.portfolio + "；生存模型 " + run.modelVersions.survival + "。",
      "參數指紋 " + run.parameterFingerprint,
      "行情資料指紋 " + run.dataFingerprint,
      "來源稽核報告與凍結 Python 參考快照各自獨立保存，不能混入同期自由配置排名。",
      ...run.limitations
    ], table: { headers: ["來源檔", "SHA-256"], rows: Object.entries(run.sourceDigests).map(([key, value]) => [key, value]) },
      links: Object.keys(run.sourceDigests).map(key => ({
        label: key,
        url: key.startsWith("backtests/") ? "https://hanjhou2000716.github.io/prstk-taiwan-etf-research/data/" + key :
          key.includes("snapshot") ? "https://hanjhou2000716.github.io/prstk-taiwan-etf-research/lpos-portfolio-lab/research/v3_observed_snapshots.json" :
            "https://hanjhou2000716.github.io/prstk-taiwan-etf-research/data/reconciliation_report.json"
      }))
    }
  ];
  return {
    schemaVersion: 1, reportId: "report-" + run.runId, runId: run.runId, requestId: run.requestId,
    generatedAt: new Date().toISOString(), status, scenarioName: run.scenario.scenarioName,
    period: run.actualPeriod, parameterFingerprint: run.parameterFingerprint, dataFingerprint: run.dataFingerprint,
    title: "LPOS Portfolio Lab｜研究報告", subtitle: run.scenario.scenarioName + "｜" + run.actualPeriod.start + " 至 " + run.actualPeriod.end,
    caveat: "研究行情是調整價格代理，非已驗證含息真實可執行融資回測。",
    charts: chartValues.length > 1 ? [{ id: "twr", title: "時間加權淨值路徑（起點 1.00）", start: run.actualPeriod.start, end: run.actualPeriod.end, points: chartValues }] : [],
    blocks
  };
}
