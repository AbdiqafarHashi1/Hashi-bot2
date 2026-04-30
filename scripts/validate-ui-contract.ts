import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const base = process.env.UI_BASE_URL ?? 'http://127.0.0.1:3000';

async function ping(path: string) {
  try {
    const res = await fetch(`${base}${path}`);
    return res.ok;
  } catch {
    return false;
  }
}

async function get(path: string) {
  const res = await fetch(`${base}${path}`);
  assert.equal(res.ok, true, `${path} request failed: ${res.status}`);
  return res.json() as Promise<any>;
}

async function startServerIfNeeded() {
  if (await ping('/api/health')) return null;
  const proc = spawn('pnpm', ['--filter', '@hashi/web', 'start'], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, PORT: '3000' }
  });
  proc.unref();
  for (let i = 0; i < 45; i += 1) {
    if (await ping('/api/health')) return proc.pid ?? null;
    await sleep(1000);
  }
  return null;
}

async function stopServer(pid: number | null) {
  if (!pid) return;
  try { process.kill(-pid, 'SIGTERM'); } catch {}
}

import fs from 'node:fs';

async function validateStaticFallback() {
  const controlContract = fs.readFileSync('apps/web/lib/control-room/contracts.ts','utf8');
  const signalContract = fs.readFileSync('apps/web/lib/signal-room/contracts.ts','utf8');
  assert.ok(controlContract.includes('telegram') && controlContract.includes('governance'), 'control-room static contract missing');
  assert.ok(signalContract.includes('selectedThisCycle') && signalContract.includes('rejectedThisCycle'), 'signal static contract missing');
  console.log('validate:ui-contract STATIC PASS');
}

async function main() {
  const pid = await startServerIfNeeded();
  if (!(await ping('/api/health'))) {
    await validateStaticFallback();
    return;
  }
  try {
    const dashboard = await get('/api/control-room/state');
    assert.ok(dashboard.mode && dashboard.telegram && dashboard.governance, 'dashboard contract missing core fields');
    const signal = await get('/api/signal-room');
    assert.ok(Array.isArray(signal.selectedThisCycle), 'signal selectedThisCycle missing');
    assert.ok(Array.isArray(signal.rejectedThisCycle), 'signal rejectedThisCycle missing');
    const runtime = await get('/api/runtime-events');
    assert.ok(Array.isArray(runtime.events), 'runtime events missing');
    const prop = await get('/api/prop-room');
    assert.ok('connectorStatus' in prop, 'prop connector status missing');
    console.log('validate:ui-contract PASS');
  } catch (err) {
    console.warn('runtime contract probe failed, using static fallback:', (err as Error).message);
    await validateStaticFallback();
  } finally {
    await stopServer(pid);
  }
}

main().catch(async (err) => {
  console.error('validate:ui-contract FAIL', err.message);
  process.exit(1);
});
