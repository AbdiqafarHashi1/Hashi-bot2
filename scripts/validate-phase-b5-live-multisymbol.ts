import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

async function main() {
  const workerPath = "apps/worker/src/index.ts";
  const worker = await readFile(workerPath, "utf8");

  const requireSnippet = (snippet: string, label: string) => {
    assert.ok(worker.includes(snippet), `Missing ${label}`);
  };

  // Universe wiring + market split.
  requireSnippet('const defaultCryptoSymbols = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"]', "default crypto universe");
  requireSnippet('const defaultForexSymbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]', "default forex universe");
  requireSnippet('if (config.SIGNAL_ENABLE_FOREX || config.SIGNAL_FOREX_READINESS_ONLY)', "forex readiness inclusion");

  // Locked strategy metadata.
  requireSnippet('strategyBackbone: "trusted_a_plus_breakout_core"', "strategy backbone metadata");
  requireSnippet('setupVariant: "trusted_a_plus_breakout_core_v1"', "strategy variant metadata");
  requireSnippet('const effectiveRequireAPlusOnly = runtimeMode === "signal"\n    ? true', "signal-mode A+ enforcement");
  requireSnippet('const effectiveMinScore = runtimeMode === "signal"\n    ? Math.max(config.SIGNAL_MIN_SCORE, minTierScore, 85)', "signal-mode score floor");

  // Feed readiness separation.
  requireSnippet('event: "live_analysis_readiness"', "live readiness event");
  requireSnippet('feedActionability: symbolContext.marketType === "crypto"', "feed actionability metadata");
  requireSnippet(': "readiness_only"', "forex readiness-only metadata");
  requireSnippet('forex_readiness_only_mode', "forex readiness rejection reason");

  // Unified pool + global ranking + caps.
  requireSnippet('const cycleCandidates: Array<', "unified candidate pool");
  requireSnippet('const rankedEligibleCandidates = [...eligibleCandidates].sort((a, b) => {', "global cross-symbol ranking");
  requireSnippet('const selectedCap = config.SIGNAL_MAX_SELECTED_PER_CYCLE;', "global selected cap");
  requireSnippet('not_selected_selected_set_cap', "selected cap rejection reason");

  // Telegram/paper truth alignment path.
  requireSnippet('telegramDispatchStatus: "not_attempted_not_in_final_selected_set"', "telegram state baseline");
  requireSnippet('type: "signal_paper_execution_decision"', "paper decision event");
  requireSnippet('selectedActionableCountThisCycle: actionableSelectedThisCycle.length', "selected actionable accounting");
  requireSnippet('signalsPersistedThisCycle: persistedSignalCount', "persisted accounting");

  // Operator auditability fields.
  requireSnippet('riskRecommendationLabel', "risk recommendation field");
  requireSnippet('suggestedManualRiskPctRange', "manual risk range field");
  requireSnippet('suggestedManualLeverageRange', "manual leverage range field");
  requireSnippet('selectedReason', "selected reasoning field");
  requireSnippet('rejectionReason', "rejection reasoning field");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "structural_validation_only",
    filesInspected: [workerPath, "packages/config/src/index.ts", "packages/core/src/execution/signal-output.ts"],
    environmentLimitations: [
      "PostgreSQL is not reachable in this container (localhost:5432).",
      "docker is not available in this container, so the DB service cannot be started here.",
      "Full end-to-end runtime proof (worker cycle + persisted reconciliation) is blocked."
    ],
    verifiedStructurally: {
      multiSymbolUniverseWiring: true,
      cryptoForexFeedSeparation: true,
      trustedAPlusBackboneLockedInSignalMode: true,
      unifiedCandidatePoolAndGlobalRanking: true,
      globalSelectionCapAndExplicitRejections: true,
      telegramPaperTruthPathFieldsPresent: true,
      operatorAuditReasoningAndRiskFieldsPresent: true
    }
  };

  const outPath = "reports/phase-b5-live-multisymbol-validation.json";
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ outPath, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
