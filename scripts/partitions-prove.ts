import { PrismaClient } from '@prisma/client';import { loadLocalRuntimeEnv } from '../packages/config/src/env';loadLocalRuntimeEnv();
async function main(){ if(!process.env.DATABASE_URL){console.log('[partitions:prove] BLOCK no DATABASE_URL');process.exit(1)} const p=new PrismaClient();
 const rows=await p.runtimePartitionState.findMany({orderBy:{id:'asc'}});
 for(const r of rows) console.log(`[partitions:prove] ${r.id} healthy=${r.healthy} readiness=${r.readiness} scannerPaused=${r.scannerPaused}`);
 console.log('[partitions:prove] PASS count', rows.length>=4);
 await p.$disconnect();}
main().catch(e=>{console.log('[partitions:prove] FAIL',e.message);process.exit(1)})
