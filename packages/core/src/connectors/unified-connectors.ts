export type AssetClass = "crypto" | "forex";
export type ExecutionVenueType = "spot" | "futures" | "forex";

export type ConnectorRuntimeMode = "dry_run" | "paper" | "demo" | "live";

export type ConnectorAccountSnapshot = {
  accountId: string;
  balance: number;
  equity: number;
  freeMargin?: number;
  leverage?: number;
  timestamp: string;
};

export type ConnectorPosition = {
  venuePositionId: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  markPrice?: number;
  unrealizedPnl?: number;
  openedAt: string;
};

export type ConnectorOrderIntent = {
  intentId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  type: "market" | "limit";
  limitPrice?: number;
  stopLoss?: number;
  takeProfits?: number[];
  metadata?: Record<string, unknown>;
};

export type ConnectorOrderAck = {
  status: "accepted" | "rejected" | "dry_run";
  reason?: string;
  venueOrderId?: string;
  acknowledgedAt: string;
};

export interface UnifiedExecutionConnector {
  connectorId: string;
  assetClass: AssetClass;
  venueType: ExecutionVenueType;
  runtimeMode: ConnectorRuntimeMode;
  getAccountSnapshot(): Promise<ConnectorAccountSnapshot>;
  placeOrder(intent: ConnectorOrderIntent): Promise<ConnectorOrderAck>;
  modifyOrder(venueOrderId: string, patch: Partial<ConnectorOrderIntent>): Promise<ConnectorOrderAck>;
  cancelOrder(venueOrderId: string): Promise<ConnectorOrderAck>;
  getOpenPositions(): Promise<ConnectorPosition[]>;
  streamHealth(): Promise<{ connected: boolean; lastHeartbeatAt?: string; reconnecting?: boolean }>;
}

export class DryRunConnector implements UnifiedExecutionConnector {
  constructor(
    public readonly connectorId: string,
    public readonly assetClass: AssetClass,
    public readonly venueType: ExecutionVenueType,
    public readonly runtimeMode: ConnectorRuntimeMode = "dry_run",
  ) {}

  async getAccountSnapshot(): Promise<ConnectorAccountSnapshot> {
    return {
      accountId: `${this.connectorId}-dry-run`,
      balance: 0,
      equity: 0,
      timestamp: new Date().toISOString(),
    };
  }

  async placeOrder(): Promise<ConnectorOrderAck> {
    return { status: "dry_run", acknowledgedAt: new Date().toISOString() };
  }

  async modifyOrder(): Promise<ConnectorOrderAck> {
    return { status: "dry_run", acknowledgedAt: new Date().toISOString() };
  }

  async cancelOrder(): Promise<ConnectorOrderAck> {
    return { status: "dry_run", acknowledgedAt: new Date().toISOString() };
  }

  async getOpenPositions(): Promise<ConnectorPosition[]> {
    return [];
  }

  async streamHealth(): Promise<{ connected: boolean; lastHeartbeatAt?: string; reconnecting?: boolean }> {
    return { connected: true, lastHeartbeatAt: new Date().toISOString(), reconnecting: false };
  }
}

export function buildDefaultConnectorRegistry() {
  return {
    binanceFutures: new DryRunConnector("binance_futures", "crypto", "futures"),
    binanceSpot: new DryRunConnector("binance_spot", "crypto", "spot"),
    mt5: new DryRunConnector("mt5_bridge", "forex", "forex"),
    ctrader: new DryRunConnector("ctrader_bridge", "forex", "forex"),
  };
}
