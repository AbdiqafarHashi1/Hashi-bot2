import type { StrategyEngine, StrategyEvalInput, StrategyCandidate } from '../strategy-engine-contracts';
import { detectRegime } from './regime-detection';
import { scoreCandidate } from './scoring';

function base(id:string,family:string,input:StrategyEvalInput,direction:'long'|'short',regimes:StrategyCandidate['eligibleRegimes']): StrategyCandidate {
  const regime = detectRegime(input);
  const last = input.candles.at(-1)?.close ?? 0;
  const rr = 2;
  const stop = direction==='long' ? last*0.995 : last*1.005;
  const tp1 = direction==='long' ? last*1.005 : last*0.995;
  const tp2 = direction==='long' ? last*1.01 : last*0.99;
  const tp3 = direction==='long' ? last*1.015 : last*0.985;
  const s = scoreCandidate({ trend: 16, volatility: 14, rr: 18, breakout: regime==='breakout'?18:11, regime: regimes.includes(regime)?17:6, momentum: 12, confluence: 10 });
  return { candidateId:`${id}:${input.symbol}:${input.now}`, strategyId:id, strategyFamily:family, symbol:input.symbol, timeframe:input.timeframe, marketType:input.marketType, direction, confidence: s.score/100, score:s.score, scoreBreakdown:s.breakdown, eligibleRegimes: regimes, detectedRegime: regime, entry:last, stopLoss:stop, takeProfits:[{label:'TP1',price:tp1},{label:'TP2',price:tp2},{label:'TP3',price:tp3}], expiryAt:new Date(Date.parse(input.now)+6*60*60*1000).toISOString(), rejectionReason: regimes.includes(regime)?undefined:`regime_incompatible:${regime}` };
}

export const cryptoFuturesMomentumBreakout: StrategyEngine = { strategyId:'crypto_futures_momentum_breakout', strategyFamily:'crypto_momentum_breakout', enabled:true, evaluate:(i)=>base('crypto_futures_momentum_breakout','crypto_momentum_breakout',i,'long',['trending','breakout','high_volatility']) };
export const cryptoTrendPullback: StrategyEngine = { strategyId:'crypto_trend_pullback', strategyFamily:'crypto_trend_pullback', enabled:true, evaluate:(i)=>base('crypto_trend_pullback','crypto_trend_pullback',i,'long',['trending','ranging']) };
export const forexSessionBreakout: StrategyEngine = { strategyId:'forex_session_breakout', strategyFamily:'forex_session_breakout', enabled:true, evaluate:(i)=>base('forex_session_breakout','forex_session_breakout',i,'long',['breakout','high_volatility']) };
export const forexTrendContinuation: StrategyEngine = { strategyId:'forex_trend_continuation', strategyFamily:'forex_trend_continuation', enabled:true, evaluate:(i)=>base('forex_trend_continuation','forex_trend_continuation',i,'short',['trending','breakout']) };

export const STRATEGY_ENGINES: StrategyEngine[] = [cryptoFuturesMomentumBreakout, cryptoTrendPullback, forexSessionBreakout, forexTrendContinuation];
