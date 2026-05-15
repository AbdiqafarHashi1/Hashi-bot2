import { NextRequest, NextResponse } from 'next/server';
import { evaluateModesReadiness } from '@/lib/modes/registry';
export async function GET(_req: NextRequest, { params }: { params: { modeId: string } }) {
  const { modes } = await evaluateModesReadiness();
  const mode = modes.find((m) => m.modeId === params.modeId);
  if (!mode) return NextResponse.json({ ok:false, error:'mode_not_found' }, { status:404 });
  return NextResponse.json({ ok:true, mode });
}
