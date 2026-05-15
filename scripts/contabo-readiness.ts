import { execSync } from 'node:child_process';
import { loadLocalRuntimeEnv } from '../packages/config/src/env';

loadLocalRuntimeEnv();

function runGate(name: string, cmd: string) {
  try {
    execSync(cmd, { stdio: 'inherit', env: { ...process.env } });
    console.log(`[contabo:readiness] PASS ${name}`);
    return true;
  } catch {
    console.log(`[contabo:readiness] BLOCK ${name}`);
    return false;
  }
}

const gates = [
  ['local:verify', 'pnpm run local:verify'],
  ['signal:e2e', 'pnpm run signal:e2e'],
  ['modes:readiness', 'pnpm run modes:readiness'],
  ['telegram:prove', 'pnpm run telegram:prove'],
  ['runtime:prove', 'pnpm run runtime:prove'],
  ['ui:prove', 'pnpm run ui:prove']
] as const;
const results = gates.map(([name, cmd]) => runGate(name, cmd));
const blocked = results.some((x) => !x);
console.log(`[contabo:readiness] deployment_allowed=${!blocked}`);
if (blocked) process.exit(1);
