import type { ScenarioV1, ScenarioResult, MarketSeries } from "./portfolio.js";
export interface SurvivalSettings {
  shockPct: number; shockMonth: number; unemploymentMonths: number; rateHikePct: number;
  horizonMonths: number; rollover: "deny" | "conditional"; prefund: boolean;
  marginPolicy: "warning" | "hypothetical_two_day_cure"; [key: string]: unknown;
}
export interface SurvivalResult {
  model: string; period: { from: string; to: string; requestedEnd: string; realizedTo: string; sessions: number; expectedSessions: number };
  completed: boolean; horizonCovered: boolean; firstHard: any; firstMargin: string | null; firstReserve: string | null;
  unpaidLoan: number; interestPaid: number; ledger: any[]; events: any[]; flags: Record<string, boolean>; [key: string]: any;
}
export interface SurvivalEngine {
  version: string; validate(settings: Partial<SurvivalSettings>): SurvivalSettings;
  scenarios(settings: Partial<SurvivalSettings>): Array<[string, SurvivalSettings]>;
  run(scenario: ScenarioV1, initial: ScenarioResult, series: Record<string, MarketSeries>, dates: string[], settings: Partial<SurvivalSettings>): SurvivalResult;
}
declare global { interface DedicatedWorkerGlobalScope { LPOSSurvival: SurvivalEngine } }
export {};
