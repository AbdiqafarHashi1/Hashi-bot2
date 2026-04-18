import { readFileSync } from "node:fs";

const contract = readFileSync("apps/web/lib/signal-room/contracts.ts", "utf8");

const requiredSnippets = [
  "accountSummary?:",
  "performanceSummary?:",
  "performanceWindows?:",
  "perEnginePerformance?:",
  "duplicateSafetyDiagnostics?:",
  "sourceOfTruth",
  "currentCycleLive:",
  "liveRuntimeEvents:",
  "symbolScanBoard:",
  "stateFlags?:",
  "combinedIsTruthful"
];

const missing = requiredSnippets.filter((snippet) => !contract.includes(snippet));

if (missing.length > 0) {
  console.error(JSON.stringify({ validation: "signal-room-contract-shape", status: "fail", missing }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  validation: "signal-room-contract-shape",
  status: "pass",
  checks: {
    accountSummaryPresent: true,
    performanceSummaryPresent: true,
    perEnginePerformancePresent: true,
    currentCyclePresent: true,
    runtimeFeedPresent: true,
    runtimeFeedNotSoleAccountSource: contract.includes("accountSummary?:")
  }
}, null, 2));
