export interface FundV1 {
  id: string; symbol: string; name: string; factor: 1 | 2;
  ownWeightPct: number; loanWeightPct: number; pledgePct: number; ltvPct: number;
  pledgeStatus: "assumed" | "blocked";
}
export interface ScenarioV1 {
  schemaVersion: 1; scenarioName: string; ownCapital: number; ownCashPct: number;
  tradeCostPct: number; borrowUtilPct: number; loanInvestPct: number; originationFeePct: number;
  aprPct: number; termMonths: number; monthlyFreeCashFlow: number; monthlyLivingExpense: number;
  minReserveMonths: number; shockPct: number; funds: FundV1[];
}
export interface MarketRow { date: string; nav: number }
export interface MarketSeries { symbol: string; kind: string; sourcePath: string; rows: MarketRow[]; start: string; end: string; count: number }
export interface ScenarioResult { valid: boolean; errors: string[]; warnings: string[]; [key: string]: any }
export interface BacktestResult { ok: boolean; version: string; priceGrade: string; period: any; stats: any; path: any[]; events: any[]; flags: any }
export interface ComparisonResult { ok: boolean; rankingEligible: boolean; ownCapital?: number; monthlyFreeCashFlow?: number; period: any; results: any[] }
export const MODEL_VERSION: string;
export const MAX_ASSETS: number;
export const COST_PCT_DEFAULT: number;
export const CATALOG: Array<{ symbol: string; name: string; factor: 1 | 2 }>;
export function catalogFund(symbol: string): { symbol: string; name: string; factor: 1 | 2 } | null;
export function makeFund(symbol: string, own?: number, loan?: number): FundV1;
export function defaultScenario(): ScenarioV1;
export function validateScenario(scenario: unknown): { errors: string[]; warnings: string[] };
export function normalizeFunds(funds: FundV1[], field: "ownWeightPct" | "loanWeightPct"): FundV1[];
export function calculateScenario(scenario: ScenarioV1, shock?: number | null): ScenarioResult;
export function validateAndParse(raw: string): ScenarioV1;
export function serializeScenario(scenario: ScenarioV1): string;
export function formatTwd(value: number): string;
export function formatPercent(value: number, digits?: number): string;
export const RESEARCH_ENGINE_STATUS: { connected: boolean; version: string; grade: string; note: string };
export function validateResearchBundle(data: unknown): any;
export function lookupResearchCase(data: any, portfolio: string, loan: number): any;
export function analyzeHistoricalScenario(args: any): Promise<any>;
export const DYNAMIC_VERSION: string;
export const PRICE_GRADE: string;
export const ASSETS: Record<string, { name: string; factor: number }>;
export function parsePublishedBuyHoldCsv(symbol: string, text: string): MarketSeries;
export function sharedDates(scenarios: ScenarioV1[], series: Record<string, MarketSeries>, options?: { from?: string; to?: string }): string[];
export function supportedSymbols(scenario: ScenarioV1): { symbols: string[]; unsupported: string[] };
export function runDynamicBacktest(scenario: ScenarioV1, series: Record<string, MarketSeries>, options?: any): BacktestResult;
export function compareDynamicBacktests(items: Array<{ name: string; scenario: ScenarioV1 }>, series: Record<string, MarketSeries>, options?: any): ComparisonResult;
export function backtestCsv(result: BacktestResult): string;
