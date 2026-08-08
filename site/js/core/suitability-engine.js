function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));
}

function isPledgeStrategy(strategy) {
  return strategy?.strategy_id?.startsWith('pledge_') || strategy?.category === '質押';
}

function isLeveragedStrategy(strategy) {
  return Number(strategy?.leverage || 1) > 1 || strategy?.strategy_id?.includes('00685L') || strategy?.strategy_id?.includes('00631L') || strategy?.strategy_id?.includes('synthetic_2x');
}

export function evaluateSuitability(strategy, metrics, constraints = {}) {
  const options = {
    horizonYears: 10,
    maxDrawdown: 0.35,
    acceptLeverage: true,
    acceptPledge: true,
    includeExperimental: true,
    maxRecoveryDays: Infinity,
    ...constraints,
  };
  const reasons = [];
  const hardFailures = [];
  const drawdown = Math.abs(Number(metrics?.max_drawdown ?? metrics?.maxDrawdown ?? 1));
  const cvar = Math.abs(Number(metrics?.cvar95 ?? 1));
  const recovery = Number(metrics?.recovery_duration ?? metrics?.recoveryDuration ?? Infinity);
  const pledge = isPledgeStrategy(strategy);
  const leveraged = isLeveragedStrategy(strategy);
  const verified = strategy?.implementation_status === 'verified';

  if (pledge && !options.acceptPledge) hardFailures.push('使用者不接受質押');
  if (leveraged && !options.acceptLeverage) hardFailures.push('使用者不接受槓桿或正二');
  if (drawdown > options.maxDrawdown) hardFailures.push(`歷史最大回撤 ${(drawdown * 100).toFixed(1)}% 超過限制`);
  if (recovery > options.maxRecoveryDays) hardFailures.push('歷史恢復時間超過限制');
  if (!verified && !options.includeExperimental) hardFailures.push('策略尚未通過 Verified 狀態');
  if (pledge) reasons.push('包含質押或借款模型，需另行檢查追繳與現金流');
  if (leveraged) reasons.push('包含槓桿／正二曝險，需檢查波動耗損');
  if (strategy?.data_type === 'synthetic_2x_proxy') reasons.push('Synthetic Proxy 不得與 Actual ETF 直接作正式排名');
  if (options.horizonYears < 3 && leveraged) reasons.push('短投資期間對高波動策略的歷史風險較敏感');

  const returnScore = clamp((Number(metrics?.cagr) || 0) / 0.20);
  const drawdownScore = clamp(1 - drawdown / Math.max(options.maxDrawdown, 0.01));
  const cvarScore = clamp(1 - cvar / Math.max(options.maxDrawdown, 0.01));
  const recoveryScore = Number.isFinite(recovery) ? clamp(1 - recovery / Math.max(options.maxRecoveryDays, 1)) : 0.5;
  const evidenceScore = verified ? 1 : 0.35;
  const score = 0.25 * returnScore + 0.25 * drawdownScore + 0.20 * cvarScore + 0.15 * recoveryScore + 0.15 * evidenceScore;
  return {
    strategy_id: strategy?.strategy_id,
    status: hardFailures.length ? 'excluded' : 'research_fit',
    score: hardFailures.length ? 0 : score,
    hard_failures: hardFailures,
    reasons,
    constraints: options,
    components: {
      return: returnScore,
      drawdown_control: drawdownScore,
      tail_risk: cvarScore,
      recovery: recoveryScore,
      evidence: evidenceScore,
    },
  };
}

export function buildSuitabilityMatrix(strategies, metricsById, constraints = {}) {
  const profiles = {
    capital_growth: { maxDrawdown: 0.60, acceptLeverage: true, acceptPledge: true },
    balanced: { maxDrawdown: 0.35, acceptLeverage: true, acceptPledge: false },
    drawdown_control: { maxDrawdown: 0.20, acceptLeverage: false, acceptPledge: false },
  };
  return Object.fromEntries(Object.entries(profiles).map(([profile, defaults]) => [
    profile,
    strategies.map(strategy => evaluateSuitability(strategy, metricsById[strategy.strategy_id], { ...defaults, ...constraints })),
  ]));
}
