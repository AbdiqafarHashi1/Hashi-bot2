import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@hashi/db';

const MUTABLE_KEYS = [
  'scannerPaused',
  'trackerPaused',
  'telegramPaused',
  'lifecyclePaused',
  'runtimeFrozen',
  'maintenanceMode',
  'emergencySafeMode',
  'cryptoEnabled',
  'forexEnabled'
] as const;

type MutableKey = (typeof MUTABLE_KEYS)[number];

function sanitizePatch(input: Record<string, unknown>) {
  const patch: Partial<Record<MutableKey, boolean>> = {};
  for (const key of MUTABLE_KEYS) {
    if (key in input && typeof input[key] === 'boolean') {
      patch[key] = input[key] as boolean;
    }
  }
  return patch;
}

export async function GET() {
  const [data, lifecycle] = await Promise.all([
    prisma.runtimeControlState.findUnique({ where: { id: 'runtime_control' } }),
    prisma.runtimeLifecycleState.findUnique({ where: { id: 'runtime_lifecycle' } })
  ]);
  return NextResponse.json({ ok: true, data, lifecycle });
}

export async function POST(req: NextRequest) {
  const raw = (await req.json()) as Record<string, unknown>;
  const patch = sanitizePatch(raw);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'no_mutable_fields' }, { status: 400 });
  }
  const actor = req.headers.get('x-operator-id') ?? 'unknown_operator';
  const current = await prisma.runtimeControlState.findUnique({ where: { id: 'runtime_control' } });
  const data = await prisma.runtimeControlState.upsert({
    where: { id: 'runtime_control' },
    update: patch,
    create: { id: 'runtime_control', ...patch }
  });
  await prisma.runtimeControlAudit.create({
    data: {
      controlId: 'runtime_control',
      action: Object.keys(patch).join(',') || 'noop',
      actor,
      confirmed: req.headers.get('x-control-confirmed') === 'true',
      beforeState: current ?? undefined,
      afterState: data
    }
  });
  return NextResponse.json({ ok: true, data });
}
