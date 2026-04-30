import { strict as assert } from 'node:assert';
import fs from 'node:fs';

const worker = fs.readFileSync('apps/worker/src/index.ts', 'utf8');

const mustHave = [
  'RESULT_BLOCKED_NO_ENTRY',
  'TP1_HIT',
  'TP2_HIT',
  'STOP_HIT',
  'BE_AFTER_TP1',
  'notional',
  'marginUsed',
  'riskAmount',
  'realizedPnl'
];
for (const key of mustHave) assert.ok(worker.includes(key), `missing paper execution truth marker: ${key}`);
console.log('validate:paper-execution PASS');
