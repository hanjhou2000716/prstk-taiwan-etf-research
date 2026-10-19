import type { ScenarioV1, MarketSeries, BacktestResult, ComparisonResult } from "./engine/portfolio.js";
import type { SurvivalSettings, SurvivalResult } from "./engine/survival-engine.js";
export type SlotName = "A" | "B" | "C";
export interface WorkspaceV2 {
  schemaVersion: 2; current: ScenarioV1; saved: Partial<Record<SlotName, ScenarioV1>>;
  research: { from: string; to: string; rebalance: string; repayment: string; rfPct: number };
  survival: SurvivalSettings; updatedAt: string;
}
export interface ResearchRequest {
  schemaVersion: 1; requestId: string; createdAt: string; appVersion: string;
  portfolioModelVersion: string; survivalModelVersion: string; workspace: WorkspaceV2;
  current: ScenarioV1; comparison: Partial<Record<SlotName, ScenarioV1>>;
  requestedPeriod: { from: string; to: string }; research: WorkspaceV2["research"];
  survivalSettings: SurvivalSettings;
  replay?: { sourceFiles: Record<string, string>; sourceDigests: Record<string, string> };
}
export interface ValidationLayer {
  key: string; state: "passed" | "partial" | "not_run" | "assumption_only" | "blocked" | "failed"; detail: string;
}
export interface ResearchRun {
  schemaVersion: 1; requestId: string; runId: string; parameterFingerprint: string; dataFingerprint: string;
  createdAt: string; appVersion: string; modelVersions: { portfolio: string; survival: string };
  requestedPeriod: { from: string; to: string }; actualPeriod: { start: string; end: string; sessions: number };
  scenario: ScenarioV1; allocation: Record<string, any>; backtest: BacktestResult;
  benchmark: { name: string; scenario: ScenarioV1; backtest: BacktestResult };
  comparison: ComparisonResult | null;
  comparisonError: string | null; survival: Array<{ name: string; result: SurvivalResult }>;
  reference: any; validationLayers: ValidationLayer[]; limitations: string[];
  marketSeries: Record<string, MarketSeries>; sourceDigests: Record<string, string>; sourceFiles: Record<string, string>;
}
export interface ReportTableV1 { headers: string[]; rows: string[][] }
export interface ReportBlock {
  id: string; title: string; status?: string; narrative: string[];
  table?: ReportTableV1; tables?: ReportTableV1[]; links?: Array<{ label: string; url: string }>;
}
export interface ResearchReportV1 {
  schemaVersion: 1; reportId: string; runId: string; requestId: string; generatedAt: string;
  status: "complete" | "partial" | "failed"; scenarioName: string; period: { start: string; end: string; sessions: number };
  parameterFingerprint: string; dataFingerprint: string; title: string; subtitle: string; caveat: string;
  charts: Array<{ id: string; title: string; start: string; end: string; points: number[] }>;
  blocks: ReportBlock[];
}
export interface ResearchBundleV1 {
  schemaVersion: 1; type: "LPOS_RESEARCH_BUNDLE"; request: ResearchRequest;
  run: ResearchRun; report: ResearchReportV1; exportedAt: string;
}
export interface ImportPreview {
  type: "scenario" | "workspace" | "bundle"; name: string; scenario: ScenarioV1;
  workspace?: WorkspaceV2; bundle?: ResearchBundleV1; warnings: string[];
}
export interface WorkerProgress { requestId: string; stage: string; percent: number }
