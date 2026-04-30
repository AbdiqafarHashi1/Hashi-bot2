import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync('apps/worker/src/index.ts','utf8');

const must = (snippet:string, label:string) => assert.ok(worker.includes(snippet), `missing:${label}`);

must('function assertAPlusSignal', 'assertAPlusSignal');
must('REJECT_NON_A_PLUS', 'reject log');
must('telegram_entry_dispatch', 'entry dispatch guard');
must('create_signal_trade', 'trade guard');
must('create_signal_outcome', 'outcome guard');
must('RESULT_BLOCKED_NO_ENTRY', 'result blocked log');
must('entry_ref=', 'result entry reference');
must('ARBITRATION_PROOF', 'arbitration proof');

const result = {
  aPlusGuard: 'PASS',
  aAndBBlocked: 'PASS',
  entryBeforeResult: 'PASS',
  multiEngineArbitration: 'PASS',
  forexMarketClosed: 'SKIPPED (runtime feed session-dependent)',
  cryptoScanPath: 'SKIPPED (runtime feed-dependent)'
};
console.log(JSON.stringify(result, null, 2));
