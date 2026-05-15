import { NextResponse } from 'next/server';
import { evaluateModesReadiness } from '@/lib/modes/registry';
export async function GET(){ const out = await evaluateModesReadiness(); return NextResponse.json({ ok:true, matrix: out.modes.map(m=>({ modeId:m.modeId, status:m.currentReadinessStatus, blockers:m.blockingRequirements, allowedActions:m.allowedActions })) }); }
