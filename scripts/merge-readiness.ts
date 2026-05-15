import { execSync } from 'node:child_process';
const cmds=['pnpm run db:generate','pnpm run typecheck','pnpm test','pnpm run local:verify','pnpm run signal:e2e','pnpm run telegram:prove','pnpm run runtime:prove','pnpm run modes:readiness','pnpm run strategy:readiness','pnpm run personal:readiness','pnpm run prop:readiness','pnpm run partitions:prove','pnpm run ui:prove','pnpm run contabo:readiness'];
let ok=true;for(const c of cmds){try{execSync(c,{stdio:'inherit'});console.log('[merge:readiness] PASS',c)}catch{ok=false;console.log('[merge:readiness] BLOCK',c)}}
console.log(`[merge:readiness] merge_allowed=${ok}`);if(!ok)process.exit(1)
