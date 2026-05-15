import { PrismaClient } from '@prisma/client';import { loadLocalRuntimeEnv } from '../packages/config/src/env';loadLocalRuntimeEnv();
const strategies=['crypto_futures_momentum_breakout','crypto_trend_pullback','forex_session_breakout','forex_trend_continuation'] as const;
async function main(){ if(!process.env.DATABASE_URL){console.log('[strategy:readiness] BLOCK no DATABASE_URL');process.exit(1)}; const p=new PrismaClient();
 for(const s of strategies){
  const c=await p.strategyCandidateTruth.count({where:{strategyId:s}});
  const agg=await p.strategyCandidateTruth.aggregate({where:{strategyId:s},_avg:{score:true}});
  console.log(`[strategy:readiness] ${s} status=TESTING_ONLY candidates=${c} avg_score=${agg._avg.score??0}`);
 }
 await p.$disconnect();
}
main().catch(e=>{console.log('[strategy:readiness] FAIL',e.message);process.exit(1)})
