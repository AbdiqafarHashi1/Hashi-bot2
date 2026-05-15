import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@hashi/db';
const ALLOWED_COMMANDS = new Set([
  'pause_scanner','resume_scanner','pause_tracker','resume_tracker','pause_dispatch','resume_dispatch',
  'emergency_freeze','clear_emergency_freeze','maintenance_mode_on','maintenance_mode_off',
  'crypto_enable','crypto_disable','forex_enable','forex_disable','prop_enable','prop_disable','paper_mode_enable','paper_mode_disable'
]);

export async function GET() {
  const [control, lifecycle, recentAudit] = await Promise.all([
    prisma.runtimeControlState.findUnique({ where: { id: 'runtime_control' } }),
    prisma.runtimeLifecycleState.findUnique({ where: { id: 'runtime_lifecycle' } }),
    prisma.runtimeControlAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
  ]);

  return NextResponse.json({ ok: true, control, lifecycle, recentAudit });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { command?: string; payload?: unknown };
  const actor = req.headers.get('x-operator-id') ?? 'operator_terminal';
  if (!body.command) {
    return NextResponse.json({ ok: false, error: 'missing_command' }, { status: 400 });
  }
  if (!ALLOWED_COMMANDS.has(body.command)) {
    return NextResponse.json({ ok: false, error: 'invalid_command' }, { status: 400 });
  }

  const record = await prisma.operatorTerminalCommand.create({
    data: {
      command: body.command,
      actor,
      payload: (body.payload as object | undefined) ?? undefined,
      status: 'queued',
      acknowledgedAt: new Date()
    }
  });

  return NextResponse.json({ ok: true, record });
}
