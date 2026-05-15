export function normalizeScore(v:number){ return Math.max(0, Math.min(100, Number.isFinite(v)?v:0)); }
export function scoreCandidate(parts:{trend:number;volatility:number;rr:number;breakout:number;regime:number;momentum:number;confluence:number}){
  const breakdown = {
    trend: parts.trend*0.2,
    volatility: parts.volatility*0.1,
    rr: parts.rr*0.2,
    breakout: parts.breakout*0.15,
    regime: parts.regime*0.15,
    momentum: parts.momentum*0.1,
    confluence: parts.confluence*0.1
  };
  const score = normalizeScore(Object.values(breakdown).reduce((a,b)=>a+b,0));
  return { score, breakdown };
}
