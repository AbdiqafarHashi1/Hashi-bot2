import { NextResponse } from 'next/server';
import { prisma } from '@hashi/db';

export async function GET() {
  const [health, lifecycle, partitions, incidents] = await Promise.all([
    prisma.signalTruthHealth.findFirst({ orderBy: { updatedAt: 'desc' } }),
    prisma.runtimeLifecycleState.findUnique({ where: { id: 'runtime_lifecycle' } }),
    prisma.runtimePartitionState.findMany({ orderBy: { id: 'asc' } }),
    prisma.incident.findMany({ where: { resolved: false }, orderBy: { createdAt: 'desc' }, take: 20 })
  ]);

  return NextResponse.json({
    ok: true,
    runtime: {
      lifecycle,
      scanner: health?.scannerStatus ?? 'unknown',
      tracker: health?.trackerStatus ?? 'unknown',
      dispatch: health?.telegramStatus ?? 'unknown',
      dbLatencyMs: 0,
      queueLatencyMs: 0,
      eventThroughput: health?.scannerCyclesCompleted ?? 0
    },
    partitions,
    incidents
  });
}
