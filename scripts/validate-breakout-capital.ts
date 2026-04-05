import fs from 'node:fs/promises';
import path from 'node:path';

type ClosedTrade = {
  score: number;
  rMultiple: number;
  pnl: number;
  durationMs: number;
  entryTime: number;
  exitTime: number;
};

type RunPayload = {
  summary: {
    totalTrades: number;
    tradesPerDay: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    netPnL: number;
    maxDrawdown: number;
    avgHoldMs: number;
  };
  trades: ClosedTrade[];
};

type VariantResult = {
  mode: 'signal' | 'personal' | 'prop';
  variant: string;
  trades: number;
  tradesPerDay: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  netPnL: number;
  startingEquity: number;
  endingEquity: number;
  totalReturnPct: number;
  cagrPct: number;
  maxDDPct: number;
  avgHoldHours: number;
  worstLosingStreak: number;
  governanceEvents?: Record<string, number>;
  survivesFullPeriod?: boolean;
  failReason?: string;
};

const DATASET_PATH = 'data/ETHUSDT_15m.csv';
const A_PLUS_SCORE = 70;

function round(n: number, p = 2) {
  const m = 10 ** p;
  return Math.round(n * m) / m;
}

function yearsBetween(startTs: number, endTs: number) {
  return Math.max((endTs - startTs) / (365.25 * 24 * 60 * 60 * 1000), 1 / 365.25);
}

function maxDD(curve: number[]) {
  let peak = curve[0] ?? 0;
  let worst = 0;
  for (const x of curve) {
    peak = Math.max(peak, x);
    if (peak > 0) worst = Math.max(worst, ((peak - x) / peak) * 100);
  }
  return worst;
}

function streak(tradePnls: number[]) {
  let worst = 0;
  let curr = 0;
  for (const p of tradePnls) {
    if (p < 0) {
      curr += 1;
      worst = Math.max(worst, curr);
    } else curr = 0;
  }
  return worst;
}

function dayKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10);
}

function simulate(
  mode: 'personal' | 'prop',
  variant: string,
  trades: ClosedTrade[],
  startEq: number,
  riskFn: (trade: ClosedTrade, state: SimState) => number,
  governance?: Governance
): VariantResult {
  const startTs = trades[0]?.entryTime ?? 0;
  const endTs = trades[trades.length - 1]?.exitTime ?? 0;
  const years = yearsBetween(startTs, endTs);
  const state: SimState = {
    equity: startEq,
    peak: startEq,
    maxLossStreak: 0,
    lossStreak: 0,
    tradePnls: [],
    wins: 0,
    losses: 0,
    curve: [startEq],
    lockUntil: 0,
    governanceEvents: {
      dailyLossLock: 0,
      trailingDrawdownLock: 0,
      maxConsecutiveLossLock: 0
    },
    dailyPnl: new Map()
  };

  for (const t of trades) {
    if (t.entryTime < state.lockUntil) continue;

    const ddPct = state.peak > 0 ? ((state.peak - state.equity) / state.peak) * 100 : 0;
    const dKey = dayKey(t.exitTime);
    const dayPnl = state.dailyPnl.get(dKey) ?? 0;

    if (governance && dayPnl <= -(state.equity * governance.dailyLossLockPct) / 100) {
      state.lockUntil = t.exitTime + governance.lockMs;
      state.governanceEvents.dailyLossLock += 1;
      continue;
    }

    if (governance && ddPct >= governance.trailingDdLockPct) {
      state.lockUntil = t.exitTime + governance.lockMs;
      state.governanceEvents.trailingDrawdownLock += 1;
      continue;
    }

    if (governance && state.lossStreak >= governance.maxConsecutiveLosses) {
      state.lockUntil = t.exitTime + governance.lockMs;
      state.governanceEvents.maxConsecutiveLossLock += 1;
      state.lossStreak = 0;
      continue;
    }

    const riskPct = Math.max(0.05, riskFn(t, state));
    const pnl = state.equity * (riskPct / 100) * t.rMultiple;
    state.equity += pnl;
    state.tradePnls.push(pnl);
    state.curve.push(state.equity);
    state.dailyPnl.set(dKey, dayPnl + pnl);

    if (pnl >= 0) {
      state.wins += 1;
      state.lossStreak = 0;
    } else {
      state.losses += 1;
      state.lossStreak += 1;
      state.maxLossStreak = Math.max(state.maxLossStreak, state.lossStreak);
    }
    state.peak = Math.max(state.peak, state.equity);
  }

  const grossWin = state.tradePnls.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(state.tradePnls.filter((x) => x < 0).reduce((a, b) => a + b, 0));

  return {
    mode,
    variant,
    trades: state.tradePnls.length,
    tradesPerDay: state.tradePnls.length / Math.max((endTs - startTs) / (24 * 60 * 60 * 1000), 1),
    winRate: state.tradePnls.length ? (state.wins / state.tradePnls.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : 0,
    expectancy: state.tradePnls.length ? state.tradePnls.reduce((a, b) => a + b, 0) / state.tradePnls.length : 0,
    netPnL: state.tradePnls.reduce((a, b) => a + b, 0),
    startingEquity: startEq,
    endingEquity: state.equity,
    totalReturnPct: ((state.equity / startEq) - 1) * 100,
    cagrPct: (Math.pow(state.equity / startEq, 1 / years) - 1) * 100,
    maxDDPct: maxDD(state.curve),
    avgHoldHours: trades.reduce((a, b) => a + b.durationMs, 0) / Math.max(trades.length, 1) / 3_600_000,
    worstLosingStreak: state.maxLossStreak,
    governanceEvents: governance ? state.governanceEvents : undefined,
    survivesFullPeriod: governance ? state.equity > startEq * 0.85 : undefined,
    failReason: governance && state.equity <= startEq * 0.85 ? 'dropped below 85% equity floor' : undefined
  };
}

type Governance = {
  dailyLossLockPct: number;
  trailingDdLockPct: number;
  maxConsecutiveLosses: number;
  lockMs: number;
};

type SimState = {
  equity: number;
  peak: number;
  maxLossStreak: number;
  lossStreak: number;
  tradePnls: number[];
  wins: number;
  losses: number;
  curve: number[];
  lockUntil: number;
  governanceEvents: Record<string, number>;
  dailyPnl: Map<string, number>;
};

async function loadRun(file: string): Promise<RunPayload> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as RunPayload;
}

async function main() {
  const signalRun = await loadRun(path.resolve('runtime/backtests/phase2-signal-baseline.json'));
  const personalRun = await loadRun(path.resolve('runtime/backtests/phase2-personal-baseline.json'));
  const propRun = await loadRun(path.resolve('runtime/backtests/phase2-prop-baseline.json'));

  const datasetRaw = await fs.readFile(path.resolve(DATASET_PATH), 'utf8');
  const lines = datasetRaw.trim().split('\n');
  const firstTs = Number(lines[1].split(',')[0]);
  const lastTs = Number(lines[lines.length - 1].split(',')[0]);

  const signal: VariantResult = {
    mode: 'signal',
    variant: 'baseline',
    trades: signalRun.summary.totalTrades,
    tradesPerDay: signalRun.summary.tradesPerDay,
    winRate: signalRun.summary.winRate * 100,
    profitFactor: signalRun.summary.profitFactor,
    expectancy: signalRun.summary.expectancy,
    netPnL: signalRun.summary.netPnL,
    startingEquity: 10000,
    endingEquity: 10000 + signalRun.summary.netPnL,
    totalReturnPct: (signalRun.summary.netPnL / 10000) * 100,
    cagrPct: (Math.pow((10000 + signalRun.summary.netPnL) / 10000, 1 / yearsBetween(firstTs, lastTs)) - 1) * 100,
    maxDDPct: signalRun.summary.maxDrawdown * 100,
    avgHoldHours: signalRun.summary.avgHoldMs / 3_600_000,
    worstLosingStreak: streak(signalRun.trades.map((t) => t.pnl))
  };

  const personalTrades = personalRun.trades;
  const propTrades = propRun.trades;

  const personal = [
    simulate('personal', 'baseline', personalTrades, 1000, (t) => (t.score >= A_PLUS_SCORE ? 0.75 : 0.5)),
    simulate('personal', 'preservation', personalTrades, 1000, (t, s) => {
      const dd = ((s.peak - s.equity) / s.peak) * 100;
      if (dd >= 6 || s.lossStreak >= 3) return t.score >= A_PLUS_SCORE ? 0.4 : 0.3;
      return t.score >= A_PLUS_SCORE ? 0.75 : 0.5;
    }),
    simulate('personal', 'healthy_equity_aggression', personalTrades, 1000, (t, s) => {
      const dd = ((s.peak - s.equity) / s.peak) * 100;
      if (dd <= 2 && s.lossStreak === 0) return t.score >= A_PLUS_SCORE ? 0.95 : 0.6;
      if (dd >= 4 || s.lossStreak >= 2) return t.score >= A_PLUS_SCORE ? 0.5 : 0.35;
      return t.score >= A_PLUS_SCORE ? 0.75 : 0.5;
    }),
    simulate('personal', 'milestone_derisk', personalTrades, 1000, (t, s) => {
      const gainPct = ((s.equity / 1000) - 1) * 100;
      if (gainPct >= 30) return t.score >= A_PLUS_SCORE ? 0.45 : 0.3;
      if (gainPct >= 15) return t.score >= A_PLUS_SCORE ? 0.6 : 0.4;
      return t.score >= A_PLUS_SCORE ? 0.75 : 0.5;
    })
  ];

  const prop = [
    simulate('prop', 'baseline', propTrades, 25000, (t) => (t.score >= A_PLUS_SCORE ? 0.4 : 0.25), {
      dailyLossLockPct: 1.0,
      trailingDdLockPct: 6,
      maxConsecutiveLosses: 4,
      lockMs: 24 * 60 * 60 * 1000
    }),
    simulate('prop', 'preservation_governance_safe', propTrades, 25000, (t, s) => {
      const dd = ((s.peak - s.equity) / s.peak) * 100;
      if (dd >= 3 || s.lossStreak >= 2) return t.score >= A_PLUS_SCORE ? 0.22 : 0.15;
      return t.score >= A_PLUS_SCORE ? 0.35 : 0.22;
    }, {
      dailyLossLockPct: 0.8,
      trailingDdLockPct: 4.5,
      maxConsecutiveLosses: 3,
      lockMs: 36 * 60 * 60 * 1000
    }),
    simulate('prop', 'tighter_defensive', propTrades, 25000, (t, s) => {
      const dd = ((s.peak - s.equity) / s.peak) * 100;
      if (dd >= 2 || s.lossStreak >= 2) return 0.1;
      return t.score >= A_PLUS_SCORE ? 0.25 : 0.15;
    }, {
      dailyLossLockPct: 0.6,
      trailingDdLockPct: 3.5,
      maxConsecutiveLosses: 2,
      lockMs: 48 * 60 * 60 * 1000
    })
  ];

  const output = {
    generatedAt: new Date().toISOString(),
    dataset: {
      path: DATASET_PATH,
      rows: lines.length - 1,
      firstTimestamp: new Date(firstTs).toISOString(),
      lastTimestamp: new Date(lastTs).toISOString()
    },
    policies: {
      personal: {
        baseline: '0.5% base risk / 0.75% A+ risk',
        preservation: 'if DD>=6% OR lossStreak>=3 => risk cut to 0.3%-0.4%',
        healthyEquityAggression: 'if DD<=2% and no recent losses => 0.6% / 0.95%; throttle when DD>=4% or lossStreak>=2',
        milestoneDerisk: 'after +15% gain risk drops to 0.4%-0.6%, after +30% gain 0.3%-0.45%'
      },
      prop: {
        baseline: '0.25% base / 0.4% A+, dailyLock=1%, trailingDDLock=6%, maxLossStreakLock=4',
        preservationGovernanceSafe: 'risk 0.15%-0.35% with stricter locks (0.8%/4.5%/3)',
        tighterDefensive: 'risk 0.1%-0.25% with tight locks (0.6%/3.5%/2)'
      }
    },
    signal,
    personal,
    prop,
    tables: {
      signal: [signal],
      personal,
      prop
    }
  };

  const outPath = path.resolve('reports/phase-2y-breakout-capital-validation.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

  console.log(JSON.stringify({ outPath, dataset: output.dataset, signal: output.signal, personal: output.personal.map((x) => ({ variant: x.variant, endingEquity: round(x.endingEquity), returnPct: round(x.totalReturnPct), maxDDPct: round(x.maxDDPct), PF: round(x.profitFactor) })), prop: output.prop.map((x) => ({ variant: x.variant, endingEquity: round(x.endingEquity), returnPct: round(x.totalReturnPct), maxDDPct: round(x.maxDDPct), PF: round(x.profitFactor), survives: x.survivesFullPeriod })) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
