import { PrismaClient } from '@prisma/client';
import { loadLocalRuntimeEnv } from '../packages/config/src/env';
import { evaluateModesReadiness } from '../apps/web/lib/modes/registry';

loadLocalRuntimeEnv();
const prisma = new PrismaClient() as any;

async function safeCount(delegateName: string, args?: any): Promise<number> {
  const d = prisma[delegateName];
  if (!d || typeof d.count !== 'function') return -1;
  try { return await d.count(args); } catch { return -1; }
}
async function safeFindFirst(delegateName: string, args?: any): Promise<any> {
  const d = prisma[delegateName];
  if (!d || typeof d.findFirst !== 'function') return null;
  try { return await d.findFirst(args); } catch { return null; }
}

async function main() {
  const health = await safeFindFirst('signalTruthHealth', { orderBy: { updatedAt: 'desc' } });
  const [cycles, candidates, lifecycle, dispatches, runtimeEvents, trackerMilestones, fatalIncidents] = await Promise.all([
    safeCount('signalTruthCycle'),
    safeCount('strategyCandidateTruth'),
    safeCount('signalTruthLifecycleEvent'),
    safeCount('telegramDispatchTruth'),
    safeCount('runtimeEvent'),
    safeCount('signalTruthLifecycleEvent', { where: { eventType: { in: ['entry_triggered','tp1_hit','tp2_hit','tp3_hit','stop_hit','expired','resolved'] } } }),
    safeCount('incident', { where: { resolved: false, severity: { in: ['high','critical'] } } })
  ]);

  const now = Date.now();
  const scannerAgeMs = health?.lastScannerHeartbeatAt ? now - new Date(health.lastScannerHeartbeatAt).getTime() : null;
  const trackerAgeMs = health?.lastTrackerHeartbeatAt ? now - new Date(health.lastTrackerHeartbeatAt).getTime() : null;
  const feedAgeMs = health?.lastPriceFetchAt ? now - new Date(health.lastPriceFetchAt).getTime() : null;

  const checks = [
    { name: 'live_scanner_cycles_observed', ok: cycles > 0, detail: `cycles=${cycles}` },
    { name: 'live_tracker_cycles_observed', ok: (health?.trackerPositionsChecked ?? 0) > 0, detail: `trackerPositionsChecked=${health?.trackerPositionsChecked ?? 0}` },
    { name: 'runtime_events_emitted', ok: runtimeEvents > 0, detail: `runtimeEvents=${runtimeEvents}` },
    { name: 'candidate_rows_created', ok: candidates > 0, detail: `candidates=${candidates}` },
    { name: 'lifecycle_rows_created', ok: lifecycle > 0, detail: `lifecycle=${lifecycle}` },
    { name: 'telegram_dispatch_truth_rows_created', ok: dispatches > 0, detail: `dispatches=${dispatches}` },
    { name: 'tracker_milestones_created', ok: trackerMilestones > 0, detail: `milestones=${trackerMilestones}` },
    { name: 'scanner_heartbeat_updating', ok: scannerAgeMs !== null && scannerAgeMs < 10 * 60 * 1000, detail: `scannerAgeMs=${scannerAgeMs ?? 'missing'}` },
    { name: 'tracker_heartbeat_updating', ok: trackerAgeMs !== null && trackerAgeMs < 10 * 60 * 1000, detail: `trackerAgeMs=${trackerAgeMs ?? 'missing'}` },
    { name: 'feed_heartbeat_updating', ok: feedAgeMs !== null && feedAgeMs < 10 * 60 * 1000, detail: `feedAgeMs=${feedAgeMs ?? 'missing'}` },
    { name: 'no_fatal_incidents_active', ok: fatalIncidents === 0, detail: `fatalIncidents=${fatalIncidents}` },
  ];

  const blockers = checks.filter(c => !c.ok).map(c => c.name);
  const matrix = await evaluateModesReadiness().catch(() => ({ modes: [] as any[] }));
  const signalModes = matrix.modes.filter((m: any) => m.executionType === 'signal');

  const status = blockers.length === 0 ? 'PASS' : 'BLOCKED';
  console.log(JSON.stringify({ command: 'signal:paper:prove', status, blockers, checks, signalModes }, null, 2));
  if (status !== 'PASS') process.exit(1);
}

main().finally(async () => prisma.$disconnect());
