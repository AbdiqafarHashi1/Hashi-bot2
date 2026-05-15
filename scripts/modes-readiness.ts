import { PrismaClient } from '@prisma/client';
import { loadLocalRuntimeEnv } from '../packages/config/src/env';
import { MODE_REGISTRY, evaluateModesReadiness } from '../apps/web/lib/modes/registry';
loadLocalRuntimeEnv();
async function main(){
  if(!process.env.DATABASE_URL){console.log('[modes:readiness] BLOCK no DATABASE_URL');process.exit(1)}
  const out = await evaluateModesReadiness();
  for(const mode of out.modes){
    console.log(`[modes:readiness] ${mode.modeId} status=${mode.currentReadinessStatus} blockers=${mode.blockingRequirements.join('|') || 'none'} next=${mode.allowedActions.join(',')}`);
  }
  const signalModes = out.modes.filter((m)=>m.executionType==='signal');
  const signalPaperReady = signalModes.every((m)=>m.currentReadinessStatus==='PAPER_READY');
  console.log(`[modes:readiness] signal_paper_ready=${signalPaperReady}`);
}
main().catch((e)=>{console.log('[modes:readiness] FAIL',e.message);process.exit(1)});
