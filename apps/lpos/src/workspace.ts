import { calculateScenario, defaultScenario, parsePublishedBuyHoldCsv, validateAndParse, validateScenario } from "./engine/portfolio.js";
import type { ScenarioV1 } from "./engine/portfolio.js";
import type { ImportPreview, ResearchBundleV1, SlotName, WorkspaceV2 } from "./types.js";
const STORAGE_KEY = "lpos-v07-workspace-v2";
const EDITOR_STORAGE_KEY = "lpos-v071-editor-v3";
const LEGACY_CURRENT_KEY = "lpos-web-v01-current";
const LEGACY_SAVED_KEY = "lpos-web-v01-saved";
const SURVIVAL_KEY = "lpos-v05-survival-controls";
const DEFAULT_RESEARCH = { from: "", to: "", rebalance: "quarterly", repayment: "repay_at_term", rfPct: 0 };
const DEFAULT_SURVIVAL = { shockPct: 0, shockMonth: 2, unemploymentMonths: 0, rateHikePct: 0, horizonMonths: 18, rollover: "deny", prefund: true, marginPolicy: "warning" } as const;
function parseScenario(value: unknown): ScenarioV1 {
  if (!value || typeof value !== "object") throw new Error("情境內容不是物件");
  const parsed = validateAndParse(JSON.stringify(value));
  const result = validateScenario(parsed);
  if (result.errors.length) throw new Error(result.errors.join("；"));
  return parsed;
}
function cleanSaved(value: unknown): Partial<Record<SlotName, ScenarioV1>> {
  const result: Partial<Record<SlotName, ScenarioV1>> = {};
  if (!value || typeof value !== "object") return result;
  for (const key of ["A", "B", "C"] as SlotName[]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (candidate) try { result[key] = parseScenario(candidate); } catch { /* retain valid slots */ }
  }
  return result;
}
export function createDefaultWorkspace(): WorkspaceV2 {
  return { schemaVersion: 2, current: defaultScenario(), saved: {}, research: { ...DEFAULT_RESEARCH }, survival: { ...DEFAULT_SURVIVAL }, updatedAt: new Date().toISOString() };
}
export function validateWorkspace(value: unknown): WorkspaceV2 {
  if (!value || typeof value !== "object") throw new Error("工作區內容格式不正確");
  const raw = value as Record<string, any>;
  if (raw.schemaVersion !== 2) throw new Error("不支援的工作區版本");
  const current = parseScenario(raw.current), saved = cleanSaved(raw.saved), research = { ...DEFAULT_RESEARCH, ...(raw.research || {}) };
  if (typeof research.from !== "string" || typeof research.to !== "string") throw new Error("研究日期格式不正確");
  if (!["none", "monthly", "quarterly", "semiannual", "annual"].includes(research.rebalance)) throw new Error("再平衡設定不正確");
  if (!["repay_at_term", "conditional_rollover"].includes(research.repayment)) throw new Error("到期設定不正確");
  if (typeof research.rfPct !== "number" || !Number.isFinite(research.rfPct) || research.rfPct < 0 || research.rfPct > 30) throw new Error("無風險利率必須介於 0 至 30%");
  const survival = { ...DEFAULT_SURVIVAL, ...(raw.survival || {}) } as WorkspaceV2["survival"];
  if (!Number.isInteger(survival.horizonMonths) || survival.horizonMonths < 1 || survival.horizonMonths > 120) throw new Error("生存觀察月數需介於 1 至 120 個月");
  if (!Number.isFinite(survival.shockPct) || survival.shockPct < 0 || survival.shockPct > 90) throw new Error("生存壓力需介於 0 至 90%");
  if (!["deny", "conditional"].includes(survival.rollover) || !["warning", "hypothetical_two_day_cure"].includes(survival.marginPolicy) || typeof survival.prefund !== "boolean") throw new Error("生存假設設定不正確");
  return { schemaVersion: 2, current, saved, research, survival, updatedAt: String(raw.updatedAt || new Date().toISOString()) };
}
export function loadWorkspace(): { workspace: WorkspaceV2; notice: string } {
  const storage = window.localStorage;
  const savedV07 = storage.getItem(STORAGE_KEY);
  if (savedV07) {
    try { return { workspace: validateWorkspace(JSON.parse(savedV07)), notice: "" }; }
    catch (error) { return { workspace: createDefaultWorkspace(), notice: "已保存的工作區無法讀取：" + String((error as Error).message) }; }
  }
  const oldCurrent = storage.getItem(LEGACY_CURRENT_KEY);
  if (oldCurrent) {
    try {
      const current = parseScenario(JSON.parse(oldCurrent));
      const oldSaved = storage.getItem(LEGACY_SAVED_KEY);
      const slots = cleanSaved(oldSaved ? JSON.parse(oldSaved) : null);
      let notice = "已從 V0.6 工作區匯入；原資料備份保留於瀏覽器。";
      try { storage.setItem("lpos-v07-migration-backup", JSON.stringify({ current: JSON.parse(oldCurrent), saved: oldSaved ? JSON.parse(oldSaved) : null, savedAt: new Date().toISOString() })); }
      catch { notice = "已載入舊工作區，但瀏覽器無法建立備份；請下載工作區 JSON。"; }
      let survival = { ...DEFAULT_SURVIVAL };
      const oldSurvival = storage.getItem(SURVIVAL_KEY);
      if (oldSurvival) try { survival = { ...survival, ...JSON.parse(oldSurvival) }; } catch { /* keep defaults */ }
      return { workspace: validateWorkspace({ ...createDefaultWorkspace(), current, saved: slots, survival }), notice };
    } catch (error) { return { workspace: createDefaultWorkspace(), notice: "舊工作區格式不符，原資料仍保留：" + String((error as Error).message) }; }
  }
  return { workspace: createDefaultWorkspace(), notice: "" };
}
export function persistWorkspace(workspace: WorkspaceV2): string {
  try {
    const validated = validateWorkspace({ ...workspace, updatedAt: new Date().toISOString() });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
    return "";
  } catch (error) {
    return "工作區尚未通過驗證或瀏覽器無法保存：" + String((error as Error).message || error);
  }
}

export interface EditorStateV3 {
  schemaVersion: 3;
  workspace: WorkspaceV2;
  lastValidWorkspace: WorkspaceV2;
  drafts: Record<string, string>;
  activeStep: number;
  loanAmountTwd: number;
  cashReserveTwd: number;
  linkLoanWeights: boolean;
  canPersist: boolean;
  notice: string;
  rawBackup: string;
}

function applyDrafts(workspace: WorkspaceV2, drafts: Record<string, string>): WorkspaceV2 {
  const next = JSON.parse(JSON.stringify(workspace)) as WorkspaceV2;
  for (const [path, raw] of Object.entries(drafts)) {
    if (raw.length > 256) continue;
    if (path === "current.scenarioName") { next.current.scenarioName = raw.slice(0, 60); continue; }
    const normalized = raw.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10)).replace(/，/g, ",").trim();
    const grouped = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(normalized);
    const plain = /^-?\d+(?:\.\d+)?$/.test(normalized);
    const value = raw.trim() && (grouped || plain) ? Number(normalized.replace(/,/g, "")) : NaN;
    if (!Number.isFinite(value)) continue;
    const parts = path.split(".");
    if (parts[0] === "current" && parts.length === 2 && parts[1] in next.current) {
      (next.current as any)[parts[1]] = value;
    } else if (parts[0] === "fund" && parts.length === 3) {
      const fund = next.current.funds.find(item => item.id === parts[1]);
      if (fund && parts[2] in fund) (fund as any)[parts[2]] = value;
    } else if (parts[0] === "research" && parts.length === 2 && parts[1] === "rfPct") {
      next.research.rfPct = value;
    } else if (parts[0] === "survival" && parts.length === 2 && parts[1] in next.survival) {
      (next.survival as any)[parts[1]] = value;
    }
  }
  return next;
}

export function loadEditorState(): EditorStateV3 {
  let rawBackup = "";
  try {
    const storage = window.localStorage;
    rawBackup = storage.getItem(EDITOR_STORAGE_KEY) || storage.getItem(STORAGE_KEY) || storage.getItem(LEGACY_CURRENT_KEY) || "";
    const raw = storage.getItem(EDITOR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, any>;
      if (parsed.schemaVersion !== 3 || typeof parsed.drafts !== "object" || !parsed.drafts || Array.isArray(parsed.drafts)) throw new Error("編輯備份版本或格式不正確");
      const workspace = validateWorkspace(parsed.workspace);
      const drafts: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed.drafts)) {
        if (typeof value !== "string" || key.length > 160 || value.length > 256) throw new Error("編輯草稿欄位格式不正確");
        drafts[key] = value;
      }
      const step = Number.isInteger(parsed.activeStep) && parsed.activeStep >= 0 && parsed.activeStep <= 3 ? parsed.activeStep : 0;
      const amount = Number.isFinite(parsed.loanAmountTwd) && parsed.loanAmountTwd >= 0 && parsed.loanAmountTwd <= 1e12 ? parsed.loanAmountTwd : calculateDefaultLoan(workspace);
      const cash = Number.isFinite(parsed.cashReserveTwd) && parsed.cashReserveTwd >= 0 && parsed.cashReserveTwd <= 1e12 ? parsed.cashReserveTwd : workspace.current.ownCapital * workspace.current.ownCashPct / 100;
      const loanDraft = drafts["loan.amount"];
      const cashDraft = drafts["cash.reserve"];
      const readDraftAmount = (rawValue: string | undefined, fallback: number) => {
        if (!rawValue) return fallback;
        const normalized = rawValue.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10)).replace(/[，,]/g, ",");
        return /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(normalized) ? Number(normalized.replace(/,/g, "")) : fallback;
      };
      const restoredLoan = readDraftAmount(loanDraft, amount);
      const restoredCash = readDraftAmount(cashDraft, cash);
      return { schemaVersion: 3, workspace: applyDrafts(workspace, drafts), lastValidWorkspace: workspace, drafts, activeStep: step, loanAmountTwd: restoredLoan, cashReserveTwd: restoredCash, linkLoanWeights: parsed.linkLoanWeights === true, canPersist: true, notice: "", rawBackup };
    }
    const legacy = loadWorkspace();
    const migrated = validateWorkspace(legacy.workspace);
    const calc = calculateDefaultLoan(migrated);
    const hasExistingWorkspace = !!window.localStorage.getItem(STORAGE_KEY) || !!window.localStorage.getItem(LEGACY_CURRENT_KEY);
    const valid = hasExistingWorkspace ? migrated : validateWorkspace({ ...migrated, current: { ...migrated.current, borrowUtilPct: 0 } });
    const damagedLegacy = /無法讀取|格式不符/.test(legacy.notice);
    return { schemaVersion: 3, workspace: valid, lastValidWorkspace: valid, drafts: {}, activeStep: 0, loanAmountTwd: hasExistingWorkspace ? calc : 0, cashReserveTwd: valid.current.ownCapital * valid.current.ownCashPct / 100, linkLoanWeights: !hasExistingWorkspace, canPersist: !damagedLegacy, notice: legacy.notice, rawBackup };
  } catch (error) {
    const fallback = createDefaultWorkspace();
    return { schemaVersion: 3, workspace: fallback, lastValidWorkspace: fallback, drafts: {}, activeStep: 0, loanAmountTwd: 0, cashReserveTwd: 0, linkLoanWeights: false, canPersist: false, rawBackup,
      notice: "已保留無法讀取的原始工作區。修復前不會覆寫它；請先下載原資料或明確重設。" };
  }
}

function calculateDefaultLoan(workspace: WorkspaceV2): number {
  const result = calculateScenario(workspace.current);
  return result.valid ? Math.max(0, Number(result.borrow) || 0) : 0;
}

export function persistEditorState(state: Pick<EditorStateV3, "lastValidWorkspace" | "drafts" | "activeStep" | "loanAmountTwd" | "cashReserveTwd" | "linkLoanWeights">): string {
  try {
    const lastValid = validateWorkspace(state.lastValidWorkspace);
    if (!Number.isFinite(state.loanAmountTwd) || state.loanAmountTwd < 0 || state.loanAmountTwd > 1e12 || !Number.isFinite(state.cashReserveTwd) || state.cashReserveTwd < 0 || state.cashReserveTwd > 1e12 || !Number.isInteger(state.activeStep) || state.activeStep < 0 || state.activeStep > 3 || typeof state.linkLoanWeights !== "boolean") return "草稿狀態不完整；目前畫面輸入仍保留，請重新載入或下載備份。";
    const drafts: Record<string, string> = {};
    for (const [key, value] of Object.entries(state.drafts)) {
      if (key.length > 160 || value.length > 256) return "草稿內容超過本機保存限制，請先下載工作區備份。";
      drafts[key] = value;
    }
    const payload = JSON.stringify({ schemaVersion: 3, workspace: lastValid, drafts, activeStep: state.activeStep, loanAmountTwd: state.loanAmountTwd, cashReserveTwd: state.cashReserveTwd, linkLoanWeights: state.linkLoanWeights, savedAt: new Date().toISOString() });
    if (payload.length > 2_000_000) return "工作區超過本機保存限制，請先下載備份。";
    const storage = window.localStorage;
    storage.setItem(EDITOR_STORAGE_KEY, payload);
    if (storage.getItem(EDITOR_STORAGE_KEY) !== payload) return "本機未能確認草稿保存；目前輸入仍保留在畫面。";
    return "";
  } catch (error) {
    return "本機暫存失敗；目前輸入仍保留在畫面，請下載工作區備份。";
  }
}
function isRecord(value: unknown): value is Record<string, any> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validMarketSeries(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.rows) || value.rows.length < 30 || value.rows.length > 13000) return false;
  let prior = "";
  return value.rows.every((row: any) => {
    if (!row || typeof row.date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.date) || row.date <= prior || typeof row.nav !== "number" || !Number.isFinite(row.nav) || row.nav <= 0) return false;
    prior = row.date;
    return true;
  });
}
function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function previewImport(raw: string): Promise<ImportPreview> {
  if (raw.length > 12000000) throw new Error("檔案大於 12 MB，拒絕匯入");
  const value = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("JSON 根節點必須是物件");
  if (value.schemaVersion === 1 && value.type === "LPOS_RESEARCH_BUNDLE") {
    const bundle = value as unknown as ResearchBundleV1;
    if (bundle.request?.schemaVersion !== 1 || !bundle.request.current || !bundle.run || bundle.run.schemaVersion !== 1 || !bundle.report || bundle.report.schemaVersion !== 1) throw new Error("研究重現包缺少必要欄位");
    const scenario = parseScenario(bundle.request.current);
    const symbols = Object.keys(bundle.run.marketSeries || {});
    if (!symbols.length || symbols.some(symbol => !validMarketSeries(bundle.run.marketSeries[symbol]))) throw new Error("重現包行情序列缺值、未排序或數值不合法");
    if (bundle.request.requestId !== bundle.run.requestId || bundle.run.requestId !== bundle.report.requestId || bundle.run.runId !== bundle.report.runId) throw new Error("請求、研究結果與報告識別碼不一致");
    if (bundle.run.dataFingerprint !== bundle.report.dataFingerprint || bundle.run.parameterFingerprint !== bundle.report.parameterFingerprint) throw new Error("報告與研究結果指紋不一致");
    const run = bundle.run as any;
    const sourceFiles = run.sourceFiles;
    const sourceDigests = run.sourceDigests;
    if (!isRecord(sourceFiles) || !isRecord(sourceDigests) || Object.keys(sourceFiles).length !== Object.keys(sourceDigests).length || !Object.keys(sourceFiles).length) throw new Error("重現包缺少完整原始來源檔與指紋");
    for (const [path, text] of Object.entries(sourceFiles)) {
      if (typeof text !== "string" || text.length > 3000000 || !Object.prototype.hasOwnProperty.call(sourceDigests, path)) throw new Error("重現包來源檔格式不正確：" + path);
      const digest = await sha256(text);
      if (digest !== sourceDigests[path]) throw new Error("來源檔 SHA-256 不符：" + path);
      if (path.startsWith("backtests/")) {
        const symbol = path.match(/buy_hold_([A-Z0-9]+)\.csv$/)?.[1];
        if (!symbol || !symbols.includes(symbol)) throw new Error("行情檔代號與研究結果不符：" + path);
        const parsed = parsePublishedBuyHoldCsv(symbol, text);
        const stored = bundle.run.marketSeries[symbol];
        if (parsed.rows.length !== stored.rows.length || parsed.rows.some((row, i) => row.date !== stored.rows[i]?.date || row.nav !== stored.rows[i]?.nav)) throw new Error("儲存行情序列與原始 CSV 不一致：" + symbol);
      }
    }
    const digestText = Object.keys(sourceDigests).sort().map(key => key + ":" + sourceDigests[key]).join("\n");
    if (await sha256(digestText) !== bundle.run.dataFingerprint) throw new Error("研究資料指紋與來源檔清單不一致");
    const parameters = { current: bundle.request.current, comparison: bundle.request.comparison, requestedPeriod: bundle.request.requestedPeriod, research: bundle.request.research, survivalSettings: bundle.request.survivalSettings };
    if (await sha256(canonical(parameters)) !== bundle.run.parameterFingerprint) throw new Error("研究參數指紋與凍結請求不一致");
    validateWorkspace(bundle.request.workspace);
    return { type: "bundle", name: bundle.report.scenarioName || scenario.scenarioName, scenario, bundle, warnings: ["來源與指紋已完成自我一致性檢查；按下套用後會使用重現包內的原始價格與相同版本模型重新計算。校驗碼不證明行情來源真實性。"] };
  }
  if (value.schemaVersion === 2 && value.current) {
    const workspace = validateWorkspace(value);
    return { type: "workspace", name: workspace.current.scenarioName, scenario: workspace.current, workspace, warnings: ["套用後會替換目前工作區與 A/B/C 設定。"] };
  }
  const scenario = parseScenario(value);
  return { type: "scenario", name: scenario.scenarioName, scenario, warnings: ["只替換目前情境，既有 A/B/C 保留。"] };
}
export function exportWorkspace(workspace: WorkspaceV2): string { return JSON.stringify(validateWorkspace(workspace), null, 2); }
export function exportScenario(scenario: ScenarioV1): string { return JSON.stringify(validateAndParse(JSON.stringify(scenario)), null, 2); }
export const workspaceStorageKey = STORAGE_KEY;
