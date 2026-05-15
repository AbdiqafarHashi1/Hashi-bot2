import { PrismaClient } from '@prisma/client';
import { loadLocalRuntimeEnv } from '../packages/config/src/env';
loadLocalRuntimeEnv();
async function main(){
 const sampleEntry='📣 ENTRY ETHUSDT LONG @100 SL 95 TP1 105 TP2 110';
 const sampleLife='🔄 UPDATE ETHUSDT tp1_hit @105 R=1.0';
 const sampleAlert='⚠️ ALERT Scanner stale';
 console.log('[telegram:prove] sample_entry', sampleEntry);
 console.log('[telegram:prove] sample_lifecycle', sampleLife);
 console.log('[telegram:prove] sample_alert', sampleAlert);
 if(!process.env.DATABASE_URL){console.log('[telegram:prove] BLOCK no DATABASE_URL');return;}
 const p=new PrismaClient();
 const rows=await p.telegramDispatchTruth.findMany({orderBy:{createdAt:'desc'},take:5});
 console.log('[telegram:prove] dispatch_rows', rows.length);
 console.log('[telegram:prove] dry_run', process.env.TELEGRAM_DRY_RUN==='1' || process.env.TELEGRAM_DRY_RUN==='true');
 await p.$disconnect();
}
main().catch(e=>{console.log('[telegram:prove] FAIL',e.message);process.exit(1)})
