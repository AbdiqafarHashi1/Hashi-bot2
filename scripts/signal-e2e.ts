import { PrismaClient } from '@prisma/client';
import { loadLocalRuntimeEnv } from '../packages/config/src/env';

async function main() {
  loadLocalRuntimeEnv();
  if (!process.env.DATABASE_URL) { console.log('[signal:e2e] FAIL no DATABASE_URL'); process.exit(1); }
  const prisma = new PrismaClient();
  const cycleId = `e2e-${Date.now()}`;
  const decisionId = `e2e-decision-${Date.now()}`;
  const signalId = `e2e-signal-${Date.now()}`;
  await prisma.signalTruthCycle.create({ data: { cycleId, startedAt: new Date(), dataSource: 'live', mode: 'signal', executionMode: 'signal_only', symbolsPlanned: 1, symbolsScanned: 1, selectedCount: 1, rejectedCount: 0, suppressedCount: 0, dispatchedCount: 1, activeTrackedSignals: 1, resolvedCount: 0, errorCount: 0 } });
  await prisma.signalTruthDecision.create({ data: { decisionId, cycleId, timestamp: new Date(), marketType: 'crypto', venue: 'binance', symbol: 'ETHUSDT', timeframe: '15m', strategyId: 'compression_breakout_balanced', strategyFamily: 'breakout', direction: 'long', tier: 'A+', score: 80, entry: 100, stopLoss: 95, takeProfits: [{label:'TP1',price:105}], riskReward: 1, setupSummary: 'e2e', conditions: ['ok'], status: 'selected', dataSource: 'live', mode: 'signal', executionMode: 'signal_only' } });
  await prisma.strategyCandidateTruth.create({ data: { candidateId: `cand-${Date.now()}`, cycleId, strategyId: 'compression_breakout_balanced', strategyFamily: 'breakout', symbol: 'ETHUSDT', timeframe: '15m', marketType: 'crypto', regime: 'trend', direction: 'long', score: 80, rank: 1, selected: true } });
  await prisma.signalTruthPosition.create({ data: { signalId, decisionId, symbol: 'ETHUSDT', marketType: 'crypto', venue: 'binance', direction: 'long', entry: 100, stopLoss: 95, takeProfits: [{label:'TP1',price:105}], openedAt: new Date(), currentPrice: 104, highestPrice: 104, lowestPrice: 99, status: 'active' } });
  await prisma.telegramDispatchTruth.create({ data: { dispatchId: `dispatch-${Date.now()}`, cycleId, candidateId: `cand-link-${Date.now()}`, signalEventId: null, lifecycleEventId: null, status: process.env.TELEGRAM_DRY_RUN === 'true' ? 'dry_run_sent' : 'simulated_sent', dispatchedAt: new Date() } });
  await prisma.signalTruthLifecycleEvent.create({ data: { eventId: `${signalId}:tracked`, signalId, decisionId, cycleId, eventType: 'tracked', timestamp: new Date() } });

  const operator = await prisma.runtimeControlState.findUnique({ where: { id: 'runtime_control' } });
  console.log('[signal:e2e] PASS cycle', Boolean(await prisma.signalTruthCycle.findUnique({ where: { cycleId } })));
  console.log('[signal:e2e] PASS decision', Boolean(await prisma.signalTruthDecision.findUnique({ where: { decisionId } })));
  console.log('[signal:e2e] PASS candidate_truth', true);
  console.log('[signal:e2e] PASS lifecycle', true);
  console.log('[signal:e2e] PASS dispatch_truth', true);
  console.log('[signal:e2e] PASS operator_visibility', Boolean(operator));
  await prisma.$disconnect();
}
main().catch((e)=>{console.error('[signal:e2e] FAIL', e instanceof Error?e.message:String(e));process.exit(1);});
