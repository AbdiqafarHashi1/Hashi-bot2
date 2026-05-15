import { prisma } from '@hashi/db';
import { getConfig } from '@hashi/config';
import { getSignalTruthSummary } from '../api/signal-truth/_shared';

export const dynamic = 'force-dynamic';

export default async function SignalTruthPage() {
  const config = getConfig();
  const [health, activeCount, latestSignal, latestEvent, unresolvedIncidents] = await Promise.all([
    prisma.signalTruthHealth.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.signalTruthPosition.count({ where: { status: { notIn: ['resolved','expired','stopped','manually_closed'] } } }),
    prisma.signalTruthDecision.findFirst({ where: { status: { in: ['selected','dispatched'] } }, orderBy: { timestamp: 'desc' } }),
    prisma.signalTruthLifecycleEvent.findFirst({ orderBy: { timestamp: 'desc' } }),
    prisma.incident.findMany({ where: { resolved: false }, orderBy: { createdAt: 'desc' }, take: 20 })
  ]);
  const [latestRejected, latestSuppressed, latestResolved] = await Promise.all([
    prisma.signalTruthDecision.findFirst({ where: { status: 'rejected' }, orderBy: { timestamp: 'desc' } }),
    prisma.signalTruthDecision.findFirst({ where: { status: 'suppressed' }, orderBy: { timestamp: 'desc' } }),
    prisma.signalTruthPosition.findFirst({ where: { status: 'resolved' }, orderBy: { resolvedAt: 'desc' } })
  ]);
  const latestTelegramLifecycle = await prisma.signalTruthLifecycleEvent.findFirst({ where: { eventType: { in: ['telegram_entry_queued', 'telegram_entry_sent', 'telegram_entry_failed'] } }, orderBy: { timestamp: 'desc' } });
  const summary = await getSignalTruthSummary();

  const empty = !health && !latestSignal && !latestEvent && activeCount === 0;

  return <main className="mx-auto max-w-md p-4 text-sm text-slate-100">
    <h1 className="text-xl font-semibold mb-4">Signal Truth</h1>
    {empty ? <p className="rounded border border-slate-700 p-3">No verified data yet</p> : null}
    <div className="space-y-2">
      <p>Scanner: <b>{health?.scannerStatus ?? 'offline'}</b></p>
      <p>Tracker: <b>{health?.trackerStatus ?? 'offline'}</b></p>
      <p>Active tracked signals: <b>{activeCount}</b></p>
      <p>Latest signal sent: <b>{latestSignal?.symbol ?? '-'}</b> {latestSignal?.direction ?? ''}</p>
      <p>Latest TP/SL update: <b>{latestEvent?.eventType ?? '-'}</b></p>
      <p>Rejected/Suppressed reason: <b>{latestSignal?.rejectionReason ?? latestSignal?.suppressionReason ?? '-'}</b></p>
      <p>Telegram delivery status: <b>{health?.telegramStatus ?? 'unknown'}</b></p>
      <p>Telegram sent/failed: <b>{health?.telegramSentCount ?? 0}</b> / <b>{health?.telegramFailedCount ?? 0}</b></p>
      <p>Telegram last sent/failed: <b>{health?.lastTelegramSentAt?.toISOString() ?? '-'}</b> / <b>{health?.lastTelegramFailedAt?.toISOString() ?? '-'}</b></p>
      <p>Telegram last error: <b>{health?.lastTelegramError ?? '-'}</b></p>
      <p>Latest telegram lifecycle: <b>{latestTelegramLifecycle?.eventType ?? '-'}</b></p>
      <p>Market data status: <b>{health?.staleFeedDetected ? 'stale' : 'healthy'}</b></p>
      <p>Watchdog thresholds: <b>md {config.MARKET_DATA_STALE_MS}</b> / <b>sc {config.SCANNER_HEARTBEAT_STALE_MS}</b> / <b>tr {config.TRACKER_HEARTBEAT_STALE_MS}</b> / <b>tg {config.TELEGRAM_HEALTH_STALE_MS}</b></p>
      <p>Counters: <b>scans {health?.scannerCyclesCompleted ?? 0}</b> / selected {health?.selectedSignalsCount ?? 0} / rejected {health?.rejectedDecisionsCount ?? 0} / suppressed {health?.suppressedDecisionsCount ?? 0}</p>
      <p>Latest rejected: <b>{latestRejected?.symbol ?? '-'}</b> {latestRejected?.rejectionReason ?? ''}</p>
      <p>Latest suppressed: <b>{latestSuppressed?.symbol ?? '-'}</b> {latestSuppressed?.suppressionReason ?? ''}</p>
      <p>Latest resolved: <b>{latestResolved?.symbol ?? '-'}</b> {latestResolved?.resolutionReason ?? ''}</p>
      <p>Top candidates: <b>{summary.topCandidates?.length ?? 0}</b> | Suppressed candidates: <b>{summary.suppressedCandidates?.length ?? 0}</b></p>
      <p>Latest selected strategy: <b>{summary.topCandidates?.find((c)=>c.selected)?.strategyId ?? '-'}</b> | Regime: <b>{summary.topCandidates?.[0]?.regime ?? '-'}</b></p>
      <p>Dispatch queue snapshot: <b>{summary.telegramDispatches?.length ?? 0}</b> latest <b>{summary.telegramDispatches?.[0]?.status ?? '-'}</b></p>
      <p>Runtime control: <b>{summary.runtimeControl?.runtimeFrozen ? 'FROZEN' : 'normal'}</b> | scannerPaused <b>{String(summary.runtimeControl?.scannerPaused ?? false)}</b> | trackerPaused <b>{String(summary.runtimeControl?.trackerPaused ?? false)}</b> | telegramPaused <b>{String(summary.runtimeControl?.telegramPaused ?? false)}</b></p>
      <p>Deployment readiness: <b>{summary.deploymentReadiness?.dbReady ? 'db_ok' : 'db_fail'}</b> / <b>{summary.deploymentReadiness?.telegramConfigured ? 'tg_ok' : 'tg_missing'}</b> / <b>{summary.deploymentReadiness?.paperModeEnabled ? 'paper_on' : 'paper_off'}</b></p>
    </div>
    <section className="mt-4">
      <h2 className="font-medium">Strategy telemetry</h2>
      <ul className="mt-2 space-y-1">
        {summary.strategyTelemetry?.slice(0, 6).map((t) => <li key={t.strategyId}>{t.strategyId}: eval {t.evaluationCount} sel {t.selectedCount} rej {t.rejectedCount} avg {t.averageScore.toFixed(1)}</li>)}
      </ul>
    </section>
    <section className="mt-4">
      <h2 className="font-medium">Unresolved incidents</h2>
      <ul className="mt-2 space-y-1">
        {unresolvedIncidents.length === 0 ? <li>-</li> : unresolvedIncidents.map((incident) => <li key={incident.id}>{incident.source}: {incident.message}</li>)}
      </ul>
    </section>
    <section className="mt-4">
      <h2 className="font-medium">Runtime event feed</h2>
      <ul className="mt-2 space-y-1">
        {summary.runtimeFeed?.slice(0, 8).map((event) => <li key={event.id}>{event.type}: {event.message ?? '-'}</li>)}
      </ul>
    </section>
    <section className="mt-4">
      <h2 className="font-medium">Control audit trail</h2>
      <ul className="mt-2 space-y-1">
        {summary.controlAudit?.slice(0, 6).map((row) => <li key={row.id}>{row.actor}: {row.action} ({row.confirmed ? 'confirmed' : 'unconfirmed'})</li>)}
      </ul>
    </section>
    <section className="mt-4">
      <h2 className="font-medium">Signal timeline pointers</h2>
      <ul className="mt-2 space-y-1">
        {summary.latestLifecycleByActiveSignal?.slice(0, 6).map((row) => <li key={row.signalId}>#{row.signalId.slice(0,8)} {row.symbol} {row.status} → {row.latestLifecycle?.eventType ?? '-'}</li>)}
      </ul>
    </section>
  </main>;
}
