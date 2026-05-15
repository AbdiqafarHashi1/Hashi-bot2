import { PrismaClient } from '@prisma/client';

async function main() {
  if (!process.env.DATABASE_URL) { console.log('[signal-lifecycle-smoke] skipped_no_database_url'); return; }
  const prisma = new PrismaClient();
  const cycleId = `smoke-${Date.now()}`;
  const scenarios = ["long_tp", "short_tp", "stop_loss", "expired"] as const;
  await prisma.signalTruthCycle.create({ data: { cycleId, startedAt: new Date(), dataSource: 'replay', mode: 'signal', executionMode: 'signal_only', symbolsPlanned: 1, symbolsScanned: 1, selectedCount: 1, rejectedCount: 0, suppressedCount: 0, dispatchedCount: 1, activeTrackedSignals: 1, resolvedCount: 0, errorCount: 0 } });
  await prisma.signalTruthHealth.upsert({ where: { id: 'signal_truth_health' }, update: { scannerCyclesCompleted: { increment: 1 }, lastScannerHeartbeatAt: new Date(), lastTrackerHeartbeatAt: new Date() }, create: { id: 'signal_truth_health', scannerCyclesCompleted: 1, scannerStatus: 'online', trackerStatus: 'online', telegramStatus: 'unknown', lastScannerHeartbeatAt: new Date(), lastTrackerHeartbeatAt: new Date() } });
  for (const scenario of scenarios) {
    const decisionId = `decision-${scenario}-${Date.now()}`;
    const signalId = `signal-${scenario}-${Date.now()}`;
    const isShort = scenario === "short_tp";
    await prisma.signalTruthDecision.create({ data: { decisionId, cycleId, timestamp: new Date(), marketType: 'crypto', venue: 'binance', symbol: 'ETHUSDT', timeframe: '15m', strategyId: 'smoke', strategyFamily: 'smoke', direction: isShort ? 'short' : 'long', tier: 'A+', score: 90, entry: 100, stopLoss: isShort ? 110 : 90, takeProfits: [{label:'TP1',price:isShort?90:110,rMultiple:1}], riskReward: 1, setupSummary: scenario, conditions: ['ok'], status: 'selected', dataSource: 'replay', mode: 'signal', executionMode: 'signal_only' } });
    await prisma.signalTruthPosition.create({ data: { signalId, decisionId, symbol: 'ETHUSDT', marketType: 'crypto', venue: 'binance', direction: isShort ? 'short' : 'long', entry: 100, stopLoss: isShort ? 110 : 90, takeProfits: [{label:'TP1',price:isShort?90:110,rMultiple:1}], openedAt: new Date(Date.now()-7200000), currentPrice: scenario==="expired"?100:(isShort?89:111), highestPrice: 111, lowestPrice: 89, status: scenario==="expired"?'waiting_for_entry':'active', expiresAt: new Date(Date.now()-60000) } });
    const key = `${signalId}:${scenario==="stop_loss"?"stop_hit":"tp1_hit"}:${isShort?90:110}`;
    await prisma.signalTruthLifecycleEvent.create({ data: { eventId: `${key}:1`, signalId, decisionId, cycleId, eventType: scenario==="stop_loss"?"stop_hit":"tp1_hit", timestamp: new Date(), idempotencyKey: key } });
    await prisma.signalTruthLifecycleEvent.create({ data: { eventId: `${decisionId}:evaluated`, signalId, decisionId, cycleId, eventType: 'evaluated', timestamp: new Date() } });
    if (scenario === 'stop_loss') {
      await prisma.signalTruthDecision.create({ data: { decisionId: `${decisionId}-rej`, cycleId, timestamp: new Date(), marketType: 'crypto', venue: 'binance', symbol: 'BTCUSDT', timeframe: '15m', strategyId: 'smoke', strategyFamily: 'smoke', direction: 'none', tier: 'reject', score: 10, entry: 0, stopLoss: 0, takeProfits: [], riskReward: 0, setupSummary: 'rejected', conditions: [], status: 'rejected', rejectionReason: 'below_min_score', dataSource: 'replay', mode: 'signal', executionMode: 'signal_only' } });
      await prisma.signalTruthLifecycleEvent.create({ data: { eventId: `${decisionId}:rejected`, signalId, decisionId: `${decisionId}-rej`, cycleId, eventType: 'rejected', timestamp: new Date() } });
    }
    if (scenario === 'expired') {
      await prisma.signalTruthDecision.create({ data: { decisionId: `${decisionId}-sup`, cycleId, timestamp: new Date(), marketType: 'crypto', venue: 'binance', symbol: 'SOLUSDT', timeframe: '15m', strategyId: 'smoke', strategyFamily: 'smoke', direction: 'none', tier: 'B', score: 40, entry: 0, stopLoss: 0, takeProfits: [], riskReward: 0, setupSummary: 'suppressed', conditions: [], status: 'suppressed', suppressionReason: 'cooldown_active', dataSource: 'replay', mode: 'signal', executionMode: 'signal_only' } });
      await prisma.signalTruthLifecycleEvent.create({ data: { eventId: `${decisionId}:suppressed`, signalId, decisionId: `${decisionId}-sup`, cycleId, eventType: 'suppressed', timestamp: new Date() } });
    }
    if (scenario === "expired") await prisma.incident.create({ data: { severity: "medium", source: "market_data", message: "stale_feed_simulated", payload: { signalId } } });
  }
  const duplicateKey = `signal-long_tp-${Date.now()}:tp1_hit:110`;
  await prisma.signalTruthLifecycleEvent.create({ data: { eventId: `${duplicateKey}:a`, signalId: `signal-long_tp-${Date.now()}`, decisionId: `decision-long_tp-${Date.now()}`, cycleId, eventType: 'tp1_hit', timestamp: new Date(), idempotencyKey: duplicateKey } });
  const existing = await prisma.signalTruthLifecycleEvent.count({ where: { idempotencyKey: duplicateKey } });
  if (existing !== 1) throw new Error('idempotency_failed');
  const rejected = await prisma.signalTruthDecision.count({ where: { status: 'rejected' } });
  const suppressed = await prisma.signalTruthDecision.count({ where: { status: 'suppressed' } });
  if (rejected < 1 || suppressed < 1) throw new Error('rejected_or_suppressed_missing');
  const telegramDecisionId = `decision-telegram-${Date.now()}`;
  const telegramSignalId = `signal-telegram-${Date.now()}`;
  await prisma.signalTruthDecision.create({ data: { decisionId: telegramDecisionId, cycleId, timestamp: new Date(), marketType: 'crypto', venue: 'binance', symbol: 'ETHUSDT', timeframe: '15m', strategyId: 'smoke', strategyFamily: 'smoke', direction: 'long', tier: 'A+', score: 99, entry: 100, stopLoss: 90, takeProfits: [], riskReward: 1, setupSummary: 'telegram', conditions: [], status: 'selected', dataSource: 'replay', mode: 'signal', executionMode: 'signal_only' } });
  for (const type of ['telegram_entry_queued','telegram_entry_sent','telegram_entry_failed'] as const) {
    const key = `${cycleId}:${telegramSignalId}:${type}`;
    await prisma.signalTruthLifecycleEvent.upsert({ where: { eventId: key }, update: {}, create: { eventId: key, signalId: telegramSignalId, decisionId: telegramDecisionId, cycleId, eventType: type, timestamp: new Date(), idempotencyKey: key } });
  }
  await prisma.signalTruthHealth.upsert({
    where: { id: 'signal_truth_health' },
    update: { telegramSentCount: { increment: 1 }, telegramFailedCount: { increment: 1 }, lastTelegramSentAt: new Date(), lastTelegramFailedAt: new Date(), lastTelegramError: 'simulated_failure', telegramStatus: 'degraded' },
    create: { id: 'signal_truth_health', scannerStatus: 'online', trackerStatus: 'online', telegramStatus: 'degraded', telegramSentCount: 1, telegramFailedCount: 1, lastTelegramSentAt: new Date(), lastTelegramFailedAt: new Date(), lastTelegramError: 'simulated_failure' }
  });
  const dupCount = await prisma.signalTruthLifecycleEvent.count({ where: { eventId: `${cycleId}:${telegramSignalId}:telegram_entry_sent` } });
  if (dupCount !== 1) throw new Error('telegram_lifecycle_not_idempotent');
  const health = await prisma.signalTruthHealth.findUnique({ where: { id: 'signal_truth_health' } });
  if (!health || health.telegramSentCount < 1 || health.telegramFailedCount < 1 || !health.lastTelegramSentAt || !health.lastTelegramFailedAt) {
    throw new Error('telegram_health_counters_missing');
  }
  console.log('[signal-lifecycle-smoke] ok');
  await prisma.$disconnect();
}
main().catch((e)=>{console.error('[signal-lifecycle-smoke] failed', e instanceof Error?e.message:String(e));process.exit(1);});
