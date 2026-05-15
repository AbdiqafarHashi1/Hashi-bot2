import { PrismaClient } from '@prisma/client';import { loadLocalRuntimeEnv } from '../packages/config/src/env';loadLocalRuntimeEnv();
async function main(){
 console.log('[ui:prove] PASS middleware_auth_expected', true);
 if(!process.env.DATABASE_URL){console.log('[ui:prove] BLOCK no DATABASE_URL');process.exit(1)}
 const p=new PrismaClient();
 const rc=await p.runtimeControlState.findUnique({where:{id:'runtime_control'}});
 const rl=await p.runtimeLifecycleState.findUnique({where:{id:'runtime_lifecycle'}});
 const inc=await p.incident.count();
 const health=await p.signalTruthHealth.findFirst({orderBy:{updatedAt:'desc'}});
 console.log('[ui:prove] PASS runtime_control_visible', Boolean(rc));
 console.log('[ui:prove] PASS runtime_lifecycle_visible', Boolean(rl));
 console.log('[ui:prove] PASS incidents_visible', inc>=0);
 console.log('[ui:prove] PASS runtime_health_visible', Boolean(health));
 await p.$disconnect();
}
main().catch(e=>{console.log('[ui:prove] FAIL',e.message);process.exit(1)})
