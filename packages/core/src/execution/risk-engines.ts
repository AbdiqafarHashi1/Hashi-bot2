export type RiskDecision = { allowed: boolean; reasons: string[]; recommendedSize?: number };

export type PersonalRiskState = {
  leverageCap: number;
  maxExposure: number;
  maxSimultaneousRisk: number;
  cooldownUntil?: string;
  dailyLossLimit: number;
  killSwitch: boolean;
  activeExposure: number;
};

export type PropRiskState = {
  dailyDrawdownLimit: number;
  trailingDrawdownLimit: number;
  maxDrawdownLimit: number;
  maxConsecutiveLosses: number;
  cooldownUntil?: string;
  lockActive: boolean;
  consecutiveLosses: number;
  realizedDailyLoss: number;
};

export type RiskCheckInput = {
  notional: number;
  leverage?: number;
  riskPercent: number;
  nowIso?: string;
};

export function evaluatePersonalRisk(state: PersonalRiskState, input: RiskCheckInput): RiskDecision {
  const reasons: string[] = [];
  if (state.killSwitch) reasons.push("kill_switch_active");
  if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) reasons.push("cooldown_active");
  if ((input.leverage ?? 1) > state.leverageCap) reasons.push("leverage_cap_exceeded");
  if (state.activeExposure + input.notional > state.maxExposure) reasons.push("max_exposure_exceeded");
  if (input.riskPercent > state.maxSimultaneousRisk) reasons.push("max_simultaneous_risk_exceeded");
  return { allowed: reasons.length === 0, reasons };
}

export function evaluatePropRisk(state: PropRiskState, input: RiskCheckInput): RiskDecision {
  const reasons: string[] = [];
  if (state.lockActive) reasons.push("prop_lock_active");
  if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) reasons.push("cooldown_active");
  if (state.realizedDailyLoss >= state.dailyDrawdownLimit) reasons.push("daily_drawdown_breached");
  if (state.consecutiveLosses >= state.maxConsecutiveLosses) reasons.push("consecutive_loss_lock");
  if (input.riskPercent > state.maxDrawdownLimit) reasons.push("max_drawdown_risk_exceeded");
  return { allowed: reasons.length === 0, reasons };
}
