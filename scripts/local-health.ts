import { execSync } from 'node:child_process';

function run(label: string, cmd: string) {
  try {
    const out = execSync(cmd, { stdio: 'pipe' }).toString();
    console.log(`[local:health] PASS ${label}`);
    if (out.trim()) console.log(out.trim());
    return true;
  } catch (e: any) {
    console.log(`[local:health] FAIL ${label}`);
    if (e?.stdout) console.log(String(e.stdout));
    if (e?.stderr) console.log(String(e.stderr));
    return false;
  }
}

const checks = [
  ['compose.ps', 'docker compose ps'],
  ['api.health', "docker compose exec -T web node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))\""],
  ['api.runtime-health', "docker compose exec -T web node -e \"fetch('http://127.0.0.1:3000/api/runtime-health').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))\""],
  ['worker.runtime.prove', 'docker compose exec -T worker pnpm run worker:runtime:prove'],
  ['worker.tracker.prove', 'docker compose exec -T worker pnpm run tracker:prove'],
  ['worker.telegram.lifecycle.prove', 'docker compose exec -T worker pnpm run telegram:lifecycle:prove']
] as const;

const failed = checks.map(([l,c])=>run(l,c)).some(x=>!x);
process.exit(failed ? 1 : 0);
