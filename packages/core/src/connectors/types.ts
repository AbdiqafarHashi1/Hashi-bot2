import type { GovernanceLocks } from "../execution/breakout-execution-policy";
import type { MarketType } from "../domains";

export type ConnectorOrderIntent = {
  connector: "binance_futures_demo" | "mt5_demo";
  mode: "live_personal" | "live_prop";
  marketType: MarketType;
  symbol: string;
  mappedSymbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  stopPrice: number;
  tp1: number;
  tp2: number;
  riskPercent: number;
  setupGrade: string;
  score: number;
  confidence: number;
  metadata?: Record<string, unknown>;
};

export type ConnectorLifecyclePlan = {
  stopLoss: {
    type: "hard_stop";
    price: number;
  };
  takeProfits: Array<{
    level: "TP1" | "TP2";
    price: number;
    closeFraction: number;
  }>;
  stateReconciliation: {
    enabled: true;
    intervalMs: number;
  };
};

export type ConnectorSubmissionResult = {
  status: "accepted_demo" | "blocked";
  blockedReason?: string;
  externalId?: string;
  connector: ConnectorOrderIntent["connector"];
};

export type ConnectorReconciliationSnapshot = {
  connector: ConnectorOrderIntent["connector"];
  openOrders: number;
  openPositions: number;
  details: Record<string, unknown>;
};

export type GovernanceAwareInput = {
  governanceLocks?: GovernanceLocks;
};

export type BrokerAdapterConfig = {
  adapter: "mt5" | "ctrader" | "alpaca" | "mock";
  enabled: boolean;
  credentialsPresent: boolean;
  environment?: "demo" | "paper" | "live";
};

export interface ExecutionProvider {
  providerName: string;
  healthCheck(): Promise<boolean>;
  submitOrder(intent: ConnectorOrderIntent): Promise<ConnectorSubmissionResult>;
  reconcile(): Promise<ConnectorReconciliationSnapshot>;
}
