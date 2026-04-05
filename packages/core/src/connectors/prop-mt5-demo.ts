import type { AllocationDecision } from "../execution/portfolio-allocator";
import type {
  ConnectorLifecyclePlan,
  ConnectorOrderIntent,
  ConnectorReconciliationSnapshot,
  ConnectorSubmissionResult,
  GovernanceAwareInput
} from "./types";

export type Mt5DemoConnectorConfig = {
  login?: string;
  password?: string;
  server?: string;
  broker?: string;
  terminalId?: string;
  symbolMap?: Record<string, string>;
};

function governanceBlocked(input: GovernanceAwareInput): string | null {
  if (input.governanceLocks?.dailyLossLockActive) return "daily_loss_lock_active";
  if (input.governanceLocks?.trailingDrawdownLockActive) return "trailing_drawdown_lock_active";
  if (input.governanceLocks?.maxConsecutiveLossLockActive) return "max_consecutive_loss_lock_active";
  return null;
}

export function mapForexSymbolForMt5Demo(symbol: string, symbolMap: Record<string, string> = {}): string {
  const normalized = symbol.replace("/", "").toUpperCase();
  return symbolMap[symbol] ?? symbolMap[normalized] ?? normalized;
}

export function buildPropDemoOrderIntent(
  decision: AllocationDecision,
  config: Pick<Mt5DemoConnectorConfig, "symbolMap">,
  governance: GovernanceAwareInput
): { intent: ConnectorOrderIntent | null; blockedReason: string | null } {
  const blocked = governanceBlocked(governance);
  if (blocked) return { intent: null, blockedReason: blocked };

  if (!decision.intent || !decision.intent.executionAllowed) return { intent: null, blockedReason: decision.blockedReason ?? "intent_not_allowed" };
  if (decision.signal.marketType !== "forex") return { intent: null, blockedReason: "market_type_not_forex" };

  const sizing = decision.intent.provisionalSizingIntent;
  if (!sizing) return { intent: null, blockedReason: "missing_sizing_intent" };

  return {
    blockedReason: null,
    intent: {
      connector: "mt5_demo",
      mode: "live_prop",
      marketType: "forex",
      symbol: decision.signal.symbol,
      mappedSymbol: mapForexSymbolForMt5Demo(decision.signal.symbol, config.symbolMap ?? {}),
      side: decision.signal.side === "LONG" ? "BUY" : "SELL",
      quantity: sizing.quantity,
      entryPrice: decision.signal.entryPrice,
      stopPrice: decision.signal.stopPrice,
      tp1: decision.signal.tp1,
      tp2: decision.signal.tp2,
      riskPercent: decision.intent.riskPercent,
      setupGrade: decision.signal.setupGrade,
      score: decision.signal.score,
      confidence: decision.signal.confidence,
      metadata: {
        ...decision.signal.metadata,
        demoOnly: true,
        allocationRank: decision.rank,
        governanceEnforced: true
      }
    }
  };
}

export function buildPropDemoLifecyclePlan(intent: ConnectorOrderIntent): ConnectorLifecyclePlan {
  return {
    stopLoss: {
      type: "hard_stop",
      price: intent.stopPrice
    },
    takeProfits: [
      { level: "TP1", price: intent.tp1, closeFraction: 0.5 },
      { level: "TP2", price: intent.tp2, closeFraction: 1 }
    ],
    stateReconciliation: {
      enabled: true,
      intervalMs: 3_000
    }
  };
}

export async function submitPropDemoOrder(_config: Mt5DemoConnectorConfig, intent: ConnectorOrderIntent): Promise<ConnectorSubmissionResult> {
  return {
    status: "accepted_demo",
    connector: "mt5_demo",
    externalId: `mt5-demo-${intent.mappedSymbol}-${Date.now()}`
  };
}

export async function reconcilePropDemoState(_config: Mt5DemoConnectorConfig): Promise<ConnectorReconciliationSnapshot> {
  return {
    connector: "mt5_demo",
    openOrders: 0,
    openPositions: 0,
    details: {
      source: "demo_scaffold",
      note: "No live broker calls are performed in this phase"
    }
  };
}
