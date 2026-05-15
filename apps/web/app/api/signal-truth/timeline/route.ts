import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@hashi/db';

export async function GET(req: NextRequest) {
  const signalId = req.nextUrl.searchParams.get('signalId');
  if (!signalId) return NextResponse.json({ ok: false, error: 'signalId_required' }, { status: 400 });
  const candidate = await prisma.strategyCandidateTruth.findFirst({ where: { candidateId: signalId } });
  const lifecycle = await prisma.signalTruthLifecycleEvent.findMany({ where: { OR: [{ signalId }, { decisionId: candidate?.candidateId ?? '' }] }, orderBy: { timestamp: 'asc' }, take: 500 });
  const dispatch = await prisma.telegramDispatchTruth.findMany({ where: { candidateId: signalId }, orderBy: { createdAt: 'asc' } });
  const incidents = await prisma.incident.findMany({ where: { payload: { path: ['signalId'], equals: signalId } }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ ok: true, data: { signalId, candidate, lifecycle, dispatch, incidents } });
}
