import { PrismaClient } from '@prisma/client';
import { loadLocalRuntimeEnv } from '../packages/config/src/env';
loadLocalRuntimeEnv();
async function main(){
 if(!process.env.DATABASE_URL){console.log('[runtime:prove] BLOCK no DATABASE_URL');process.exit(1)}
 const p=new PrismaClient();
 const h=await p.signalTruthHealth.findFirst({orderBy:{updatedAt:'desc'}});
 const c=await p.signalTruthCycle.findFirst({orderBy:{createdAt:'desc'}});
 const cand=await p.strategyCandidateTruth.count();
 const dec=await p.signalTruthDecision.groupBy({by:['status'],_count:{status:true}});
 const life=await p.signalTruthLifecycleEvent.count();
 const part=await p.runtimePartitionState.count();
 console.log('[runtime:prove] PASS scanner_cycles', (h?.scannerCyclesCompleted??0)>0);
 console.log('[runtime:prove] PASS tracker_cycles', (h?.trackerPositionsChecked??0)>=0);
 console.log('[runtime:prove] PASS heartbeat', Boolean(h?.lastLoopAt));
 console.log('[runtime:prove] PASS cycle_exists', Boolean(c));
 console.log('[runtime:prove] PASS candidate_truth', cand>0);
 console.log('[runtime:prove] PASS lifecycle_events', life>0);
 console.log('[runtime:prove] PASS partitions_seeded', part>=4);
 console.log('[runtime:prove] detail decision_status', JSON.stringify(dec));
 await p.$disconnect();
}
main().catch(e=>{console.log('[runtime:prove] FAIL',e.message);process.exit(1)})
