import { NextResponse } from 'next/server';
import { evaluateModesReadiness } from '@/lib/modes/registry';
export async function GET(){ return NextResponse.json({ ok:true, ...(await evaluateModesReadiness()) }); }
