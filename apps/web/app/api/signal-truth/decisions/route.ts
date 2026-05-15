import { NextResponse } from 'next/server';
import { prisma } from '@hashi/db';
import { getSignalTruthSummary } from '../_shared';

export async function GET() {
  const data = await (async () => {
    switch ('decisions') {
      case 'summary': return getSignalTruthSummary();
      case 'cycles': return prisma.signalTruthCycle.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
      case 'decisions': return prisma.signalTruthDecision.findMany({ orderBy: { timestamp: 'desc' }, take: 200 });
      case 'active': return prisma.signalTruthPosition.findMany({ where: { status: { notIn: ['resolved','expired','stopped','manually_closed'] } }, orderBy: { openedAt: 'desc' }, take: 200 });
      case 'resolved': return prisma.signalTruthPosition.findMany({ where: { status: 'resolved' }, orderBy: { resolvedAt: 'desc' }, take: 200 });
      case 'lifecycle': return prisma.signalTruthLifecycleEvent.findMany({ orderBy: { timestamp: 'desc' }, take: 300 });
      case 'health': return prisma.signalTruthHealth.findFirst({ orderBy: { updatedAt: 'desc' } });
    }
  })();
  return NextResponse.json({ ok: true, data });
}
