import type { MarketType } from "../domains";
import type { UnifiedExecutionConnector, ConnectorOrderAck, ConnectorOrderIntent } from "../connectors/unified-connectors";

export type RuntimeExecutionMode = "signal" | "personal" | "prop";

export type ExecutionIntent = {
  executionId: string;
  signalId: string;
  symbol: string;
  marketType: MarketType;
  mode: RuntimeExecutionMode;
  side: "buy" | "sell";
  quantity: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfits?: number[];
  metadata?: Record<string, unknown>;
};

export type ExecutionEvent = {
  executionId: string;
  signalId: string;
  type: "intent_created" | "intent_blocked" | "order_ack" | "reconciled";
  payload?: Record<string, unknown>;
  timestamp: string;
};

export interface ExecutionEngine {
  engineId: string;
  mode: RuntimeExecutionMode;
  execute(intent: ExecutionIntent): Promise<{ ack: ConnectorOrderAck; events: ExecutionEvent[] }>;
}

export class SignalModeExecutionEngine implements ExecutionEngine {
  readonly engineId = "signal_mode_engine";
  readonly mode: RuntimeExecutionMode = "signal";
  async execute(intent: ExecutionIntent) {
    return {
      ack: { status: "dry_run", acknowledgedAt: new Date().toISOString() },
      events: [
        { executionId: intent.executionId, signalId: intent.signalId, type: "intent_created", timestamp: new Date().toISOString() },
        { executionId: intent.executionId, signalId: intent.signalId, type: "order_ack", payload: { status: "dry_run" }, timestamp: new Date().toISOString() },
      ],
    };
  }
}

export class ConnectedExecutionEngine implements ExecutionEngine {
  constructor(
    public readonly engineId: string,
    public readonly mode: RuntimeExecutionMode,
    private readonly connector: UnifiedExecutionConnector,
  ) {}

  async execute(intent: ExecutionIntent) {
    const orderIntent: ConnectorOrderIntent = {
      intentId: intent.executionId,
      symbol: intent.symbol,
      side: intent.side,
      quantity: intent.quantity,
      type: "market",
      stopLoss: intent.stopLoss,
      takeProfits: intent.takeProfits,
      metadata: intent.metadata,
    };

    const ack = await this.connector.placeOrder(orderIntent);
    const events: ExecutionEvent[] = [
      { executionId: intent.executionId, signalId: intent.signalId, type: "intent_created", timestamp: new Date().toISOString() },
      { executionId: intent.executionId, signalId: intent.signalId, type: "order_ack", payload: ack as Record<string, unknown>, timestamp: new Date().toISOString() },
    ];
    return { ack, events };
  }
}
