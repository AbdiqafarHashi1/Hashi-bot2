import type { AllocationDecision } from "../execution/portfolio-allocator";
import type {
  ConnectorLifecyclePlan,
  ConnectorOrderIntent,
  ConnectorReconciliationSnapshot,
  ConnectorSubmissionResult
} from "./types";

export type BinanceDemoConnectorConfig = {
  apiKey?: string;
  apiSecret?: string;
  baseUrl: string;
  symbolMap?: Record<string, string>;
};

export function mapCryptoSymbolForBinanceDemo(symbol: string, symbolMap: Record<string, string> = {}): string {
  return symbolMap[symbol] ?? symbol;
}

export function buildPersonalDemoOrderIntent(
  decision: AllocationDecision,
  config: Pick<BinanceDemoConnectorConfig, "symbolMap">
): ConnectorOrderIntent | null {
  if (!decision.intent || !decision.intent.executionAllowed) return null;
  if (decision.signal.marketType !== "crypto") return null;
  const sizing = decision.intent.provisionalSizingIntent;
  if (!sizing) return null;

  return {
    connector: "binance_futures_demo",
    mode: "live_personal",
    marketType: "crypto",
    symbol: decision.signal.symbol,
    mappedSymbol: mapCryptoSymbolForBinanceDemo(decision.signal.symbol, config.symbolMap ?? {}),
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
      allocationRank: decision.rank
    }
  };
}

export function buildPersonalDemoLifecyclePlan(intent: ConnectorOrderIntent): ConnectorLifecyclePlan {
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
      intervalMs: 5_000
    }
  };
}

export async function submitPersonalDemoOrder(_config: BinanceDemoConnectorConfig, intent: ConnectorOrderIntent): Promise<ConnectorSubmissionResult> {
  return {
    status: "accepted_demo",
    connector: "binance_futures_demo",
    externalId: `binance-demo-${intent.mappedSymbol}-${Date.now()}`
  };
}

export async function reconcilePersonalDemoState(_config: BinanceDemoConnectorConfig): Promise<ConnectorReconciliationSnapshot> {
  return {
    connector: "binance_futures_demo",
    openOrders: 0,
    openPositions: 0,
    details: {
      source: "demo_scaffold",
      note: "No live exchange calls are performed in this phase"
    }
  };
}
