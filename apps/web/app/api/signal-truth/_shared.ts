import { prisma } from '@hashi/db';
import { getConfig } from '@hashi/config';
import { STRATEGY_ENGINES } from '@hashi/core';

export async function getSignalTruthSummary() {
  const config = getConfig();
  const [health, activeCount, unresolvedIncidents, latestIncident, latestCycle, latestSelected, latestRejected, latestSuppressed, latestResolved, latestUpdate, latestTelegramLifecycle, topCandidates, suppressedCandidates, strategyTelemetry, telegramDispatches, runtimeFeed, runtimeControl, controlAudit] = await Promise.all([
    prisma.signalTruthHealth.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.signalTruthPosition.count({ where: { status: { notIn: ['resolved','expired','stopped','manually_closed'] } } }),
    prisma.incident.count({ where: { resolved: false } }).catch(() => 0),
    prisma.incident.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null),
    prisma.signalTruthCycle.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.signalTruthDecision.findFirst({ where: { status: 'selected' }, orderBy: { timestamp: 'desc' } }),
    prisma.signalTruthDecision.findFirst({ where: { status: 'rejected' }, orderBy: { timestamp: 'desc' } }),
    prisma.signalTruthDecision.findFirst({ where: { status: 'suppressed' }, orderBy: { timestamp: 'desc' } }),
    prisma.signalTruthPosition.findFirst({ where: { status: 'resolved' }, orderBy: { resolvedAt: 'desc' } }),
    prisma.signalTruthLifecycleEvent.findFirst({ where: { eventType: { in: ['tp1_hit','tp2_hit','tp3_hit','stop_hit','breakeven_hit','expired'] } }, orderBy: { timestamp: 'desc' } }),
    prisma.signalTruthLifecycleEvent.findFirst({ where: { eventType: { in: ['telegram_entry_queued','telegram_entry_sent','telegram_entry_failed'] } }, orderBy: { timestamp: 'desc' } }),
    prisma.strategyCandidateTruth.findMany({ orderBy: [{ cycleId: 'desc' }, { score: 'desc' }], take: 20 }),
    prisma.strategyCandidateTruth.findMany({ where: { suppressionReason: { not: null } }, orderBy: [{ cycleId: 'desc' }, { score: 'desc' }], take: 20 }),
    prisma.strategyTelemetry.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 }),
    prisma.telegramDispatchTruth.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.runtimeEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 80 }),
    prisma.runtimeControlState.findUnique({ where: { id: 'runtime_control' } }),
    prisma.runtimeControlAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
  ]);
  const now = Date.now();
  const flags = {
    scannerStale: health?.lastScannerHeartbeatAt ? now - new Date(health.lastScannerHeartbeatAt).getTime() > config.SCANNER_HEARTBEAT_STALE_MS : true,
    trackerStale: health?.lastTrackerHeartbeatAt ? now - new Date(health.lastTrackerHeartbeatAt).getTime() > config.TRACKER_HEARTBEAT_STALE_MS : true,
    telegramStale: health?.lastTelegramSentAt ? now - new Date(health.lastTelegramSentAt).getTime() > config.TELEGRAM_HEALTH_STALE_MS : true,
    marketDataStale: health?.lastPriceFetchAt ? now - new Date(health.lastPriceFetchAt).getTime() > config.MARKET_DATA_STALE_MS : true
  };
  const activeSignals = await prisma.signalTruthPosition.findMany({
    where: { status: { notIn: ['resolved', 'expired', 'stopped', 'manually_closed'] } },
    orderBy: { openedAt: 'desc' },
    take: 100
  });
  const latestLifecycleByActiveSignal = await Promise.all(activeSignals.map(async (signal) => {
    const latestLifecycle = await prisma.signalTruthLifecycleEvent.findFirst({ where: { signalId: signal.signalId }, orderBy: { timestamp: 'desc' } });
    return { signalId: signal.signalId, symbol: signal.symbol, status: signal.status, latestLifecycle };
  }));
  const thresholds = {
    MARKET_DATA_STALE_MS: config.MARKET_DATA_STALE_MS,
    SCANNER_HEARTBEAT_STALE_MS: config.SCANNER_HEARTBEAT_STALE_MS,
    TRACKER_HEARTBEAT_STALE_MS: config.TRACKER_HEARTBEAT_STALE_MS,
    TELEGRAM_HEALTH_STALE_MS: config.TELEGRAM_HEALTH_STALE_MS,
    TELEGRAM_MAX_CONSECUTIVE_FAILURES: config.TELEGRAM_MAX_CONSECUTIVE_FAILURES,
    RUNTIME_ERROR_RATE_MAX: config.RUNTIME_ERROR_RATE_MAX
  };
  const activeStrategies = STRATEGY_ENGINES.map((entry) => ({ strategyId: entry.strategyId, strategyFamily: entry.strategyFamily, enabled: entry.enabled }));
  const deploymentReadiness = {
    dbReady: true,
    telegramConfigured: Boolean(config.TELEGRAM_BOT_TOKEN && (config.TELEGRAM_SIGNAL_CHAT_ID || config.TELEGRAM_CHAT_ID)),
    scannerRuntimeEnabled: config.SCANNER_RUNTIME_ENABLE,
    paperModeEnabled: config.PAPER_MODE_ENABLED,
    frozen: Boolean(runtimeControl?.runtimeFrozen || runtimeControl?.emergencySafeMode)
  };
  return { health, activeCount, unresolvedIncidents, latestIncident, latestCycle, latestSelected, latestRejected, latestSuppressed, latestResolved, latestUpdate, latestTelegramLifecycle, latestLifecycleByActiveSignal, activeStrategies, topCandidates, suppressedCandidates, strategyTelemetry, telegramDispatches, runtimeFeed, runtimeControl, controlAudit, deploymentReadiness, thresholds, flags };
}
