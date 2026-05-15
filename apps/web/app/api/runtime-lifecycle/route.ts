import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@hashi/db';

export async function GET() {
  const state = await prisma.runtimeLifecycleState.upsert({
    where: { id: 'runtime_lifecycle' },
    update: {},
    create: { id: 'runtime_lifecycle' }
  });
  return NextResponse.json({ ok: true, state });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<{
    stage: string;
    status: string;
    marketType: string;
    mode: string;
    completionPct: number;
    notes: string;
  }>;

  const actor = req.headers.get('x-operator-id') ?? 'worker';
  const updated = await prisma.runtimeLifecycleState.upsert({
    where: { id: 'runtime_lifecycle' },
    update: {
      stage: body.stage,
      status: body.status,
      marketType: body.marketType,
      mode: body.mode,
      completionPct: body.completionPct,
      notes: body.notes,
      lastTransitionAt: new Date()
    },
    create: {
      id: 'runtime_lifecycle',
      stage: body.stage ?? 'boot',
      status: body.status ?? 'running',
      marketType: body.marketType,
      mode: body.mode,
      completionPct: body.completionPct ?? 0,
      notes: body.notes,
      lastTransitionAt: new Date()
    }
  });

  await prisma.runtimeControlAudit.create({
    data: {
      controlId: 'runtime_lifecycle',
      action: `lifecycle:${updated.stage}:${updated.status}`,
      actor,
      confirmed: true,
      afterState: updated
    }
  });

  return NextResponse.json({ ok: true, state: updated });
}
