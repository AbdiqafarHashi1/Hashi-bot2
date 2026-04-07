import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { prisma } from '@hashi/db';

type RunSummary = {
  name: string;
  cycleId: string;
  scanned: number;
  candidates: number;
  selected: number;
  persisted: number;
  opened: number;
  telegramDispatched: number;
  rejected: number;
  rejectedBy: Record<string, number>;
  selectedEqualsPersistedEqualsOpened: boolean;
  sidesObserved: string[];
  openTrades: Array<{
    symbol: string;
    side: string;
    entry: number;
    stop: number;
    tp1: number;
    tp2: number;
    qty: number;
    notional: number;
    leverageCap: number;
    effectiveLeverage: number;
    riskAmount: number;
    riskPct: number;
  }>;
  evaluatedShortCandidates: number;
};

function run(cmd: string, env: Record<string, string>) {
  const result = spawnSync('bash', ['-lc', cmd], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env
    },
    encoding: 'utf8'
  });
  return result;
}

async function resetState() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "SignalTrade", "SignalEvent", "SignalOutcome", "RuntimeEvent", "TransportEvent", "Incident" RESTART IDENTITY CASCADE;');
  await prisma.systemControl.upsert({
    where: { id: 'system' },
    update: {
      isRunning: true,
      activeMode: 'signal',
      killSwitchActive: false,
      allowedSymbols: ['ETHUSDT', 'BTCUSDT']
    },
    create: {
      id: 'system',
      isRunning: true,
      activeMode: 'signal',
      killSwitchActive: false,
      allowedSymbols: ['ETHUSDT', 'BTCUSDT']
    }
  });
}

async function runCycle(name: string, overrides: Record<string, string>): Promise<RunSummary> {
  await resetState();
  const command = [
    'set -a',
    'source .env.signal',
    'set +a',
    ...Object.entries(overrides).map(([key, value]) => `export ${key}='${value.replace(/'/g, "'\\''")}'`),
    'timeout 8s pnpm --filter @hashi/worker dev > /tmp/worker_dataset_' + name + '.log 2>&1',
    'true'
  ].join('; ');
  const result = run(command, {});
  if (result.error) throw result.error;

  const reconciliationEvent = await prisma.runtimeEvent.findFirst({
    where: { type: 'signal_cycle_reconciliation', mode: 'signal' },
    orderBy: { createdAt: 'desc' }
  });
  if (!reconciliationEvent?.payload) {
    throw new Error(`No reconciliation payload found for ${name}`);
  }

  const payload = reconciliationEvent.payload as {
    cycleId: string;
    cycleTruth: {
      symbolsActuallyScannedCount: number;
      candidatesEvaluatedThisCycle: number;
      selectedActionableCountThisCycle: number;
      signalsPersistedThisCycle: number;
      telegramSignalsDispatchedThisCycle: number;
      rejectedCountThisCycle: number;
      candidatesRejectedBy: Record<string, number>;
      evaluatedCandidatesThisCycle?: Array<{
        symbol: string;
        side: string;
        score: number;
        tier: string;
      }>;
    };
  };

  const cycleId = payload.cycleId;
  const [events, openTrades] = await Promise.all([
    prisma.signalEvent.findMany({ where: { cycleId } }),
    prisma.signalTrade.findMany({ where: { cycleId, OR: [{ status: 'open' }, { status: 'tp1_hit' }], closedAt: null } })
  ]);

  const openTradeDetails = openTrades.map((trade) => {
    const equity = trade.paperEquityBase ?? 0;
    const notional = trade.notional ?? 0;
    const riskAmount = trade.riskAmount ?? 0;
    return {
      symbol: trade.symbol,
      side: trade.side,
      entry: trade.entryPrice,
      stop: trade.stopPrice,
      tp1: trade.tp1Price,
      tp2: trade.tp2Price,
      qty: trade.quantity ?? 0,
      notional,
      leverageCap: trade.leverage ?? 0,
      effectiveLeverage: equity > 0 ? notional / equity : 0,
      riskAmount,
      riskPct: equity > 0 ? riskAmount / equity : 0
    };
  });

  const telegramDispatched = events.filter((entry) => entry.telegramDispatchStatus === 'sent').length;

  return {
    name,
    cycleId,
    scanned: payload.cycleTruth.symbolsActuallyScannedCount,
    candidates: payload.cycleTruth.candidatesEvaluatedThisCycle,
    selected: payload.cycleTruth.selectedActionableCountThisCycle,
    persisted: payload.cycleTruth.signalsPersistedThisCycle,
    opened: openTrades.length,
    telegramDispatched,
    rejected: payload.cycleTruth.rejectedCountThisCycle,
    rejectedBy: payload.cycleTruth.candidatesRejectedBy,
    selectedEqualsPersistedEqualsOpened:
      payload.cycleTruth.selectedActionableCountThisCycle === payload.cycleTruth.signalsPersistedThisCycle
      && payload.cycleTruth.signalsPersistedThisCycle === openTrades.length,
    sidesObserved: Array.from(new Set(events.map((entry) => entry.side))),
    openTrades: openTradeDetails,
    evaluatedShortCandidates: (payload.cycleTruth.evaluatedCandidatesThisCycle ?? []).filter((entry) => entry.side === 'SHORT').length
  };
}

async function main() {
  const baseOverrides = {
    SIGNAL_DATASET_MODE_ENABLED: '1',
    SIGNAL_DATASET_SYMBOL_PATHS_JSON: '{"ETHUSDT":"data/ETHUSDT_15m.csv","BTCUSDT":"data/BTCUSDT_15m.csv"}',
    SIGNAL_ENABLE_CRYPTO: '1',
    SIGNAL_ENABLE_FOREX: '0',
    SIGNAL_FOREX_READINESS_ONLY: '1',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: ''
  };

  const runA = await runCycle('a_mode', {
    ...baseOverrides,
    SIGNAL_MIN_TIER: 'A',
    SIGNAL_MIN_SCORE: '70',
    SIGNAL_REQUIRE_A_PLUS_ONLY: '0'
  });

  const runAPlus = await runCycle('a_plus_mode', {
    ...baseOverrides,
    SIGNAL_MIN_TIER: 'A+',
    SIGNAL_MIN_SCORE: '74',
    SIGNAL_REQUIRE_A_PLUS_ONLY: '1'
  });

  let shortProbe: RunSummary | null = null;
  for (const offset of [0, 100, 250, 500, 750, 1000]) {
    const probe = await runCycle(`short_probe_${offset}`, {
      ...baseOverrides,
      SIGNAL_MIN_TIER: 'B',
      SIGNAL_MIN_SCORE: '0',
      SIGNAL_REQUIRE_A_PLUS_ONLY: '0',
      SIGNAL_DATASET_WINDOW_OFFSET: String(offset)
    });
    if ((probe.evaluatedShortCandidates > 0) || probe.sidesObserved.includes('SHORT')) {
      shortProbe = probe;
      break;
    }
  }

  const longObserved = [runA, runAPlus].some((runItem) => runItem.sidesObserved.includes('LONG'));
  const shortObserved = [runA, runAPlus, ...(shortProbe ? [shortProbe] : [])].some((runItem) => runItem.sidesObserved.includes('SHORT'));
  const shortImplemented = [runA, runAPlus, ...(shortProbe ? [shortProbe] : [])].some((runItem) => runItem.evaluatedShortCandidates > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    datasetMode: true,
    datasets: ['data/ETHUSDT_15m.csv', 'data/BTCUSDT_15m.csv'],
    runs: shortProbe ? [runA, runAPlus, shortProbe] : [runA, runAPlus],
    thresholdPolicyResults: {
      aModeAllowsA: runA.selected > 0,
      aPlusOnlyBlocksA: runAPlus.selected === 0,
      aPlusObserved: runAPlus.selected > 0
    },
    longObserved,
    shortObserved,
    shortCapabilityStatus: shortObserved
      ? 'IMPLEMENTED_AND_OBSERVED'
      : shortImplemented
        ? 'IMPLEMENTED_NOT_OBSERVED'
        : 'NOT_IMPLEMENTED'
  };

  const outPath = 'reports/signal-mode-dataset-validation.json';
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ outPath, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
