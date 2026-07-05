import type { AdapterCapabilityProfile, Platform } from "./types";
export class MockAdapterCapabilityRegistry {
  private readonly capabilities = new Map<Platform, AdapterCapabilityProfile>([
    ["Binance", { adapterType: "Binance", supportsMarket: ["crypto"], supportsStopLoss: true, supportsTakeProfit: true, supportsPartialClose: true, supportsTrailing: true, supportsLeverage: true, supportsReduceOnly: true, supportsPositionSync: true, maxLeverage: 20, supportedOrderTypes: ["OpenPosition", "MoveStopLoss", "MoveTakeProfit", "Synchronize"] }],
    ["Bybit", { adapterType: "Bybit", supportsMarket: ["crypto"], supportsStopLoss: true, supportsTakeProfit: true, supportsPartialClose: true, supportsTrailing: true, supportsLeverage: true, supportsReduceOnly: true, supportsPositionSync: true, maxLeverage: 15, supportedOrderTypes: ["OpenPosition", "MoveStopLoss", "MoveTakeProfit", "Synchronize"] }],
    ["MT5", { adapterType: "MT5", supportsMarket: ["forex", "indices", "commodities"], supportsStopLoss: true, supportsTakeProfit: true, supportsPartialClose: true, supportsTrailing: false, supportsLeverage: true, supportsReduceOnly: false, supportsPositionSync: true, maxLeverage: 5, supportedOrderTypes: ["OpenPosition", "MoveStopLoss", "MoveTakeProfit", "Synchronize"] }],
    ["Mock", { adapterType: "Mock", supportsMarket: ["crypto", "forex", "indices", "commodities"], supportsStopLoss: true, supportsTakeProfit: true, supportsPartialClose: true, supportsTrailing: true, supportsLeverage: true, supportsReduceOnly: true, supportsPositionSync: true, maxLeverage: 100, supportedOrderTypes: ["OpenPosition", "MoveStopLoss", "MoveTakeProfit", "Synchronize"] }]
  ]);
  get(platform: Platform) { return this.capabilities.get(platform); }
}
