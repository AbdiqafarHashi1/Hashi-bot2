export type ConfigPresenceStatus = {
  configured: boolean;
  missing: string[];
};

export type ControlRoomConnectorReadiness = {
  personalDemo: {
    enabled: boolean;
    credentials: ConfigPresenceStatus;
    transport: {
      baseUrlPresent: boolean;
      symbolMapEntries: number;
    };
  };
  propDemo: {
    enabled: boolean;
    credentials: ConfigPresenceStatus;
    transport: {
      serverPresent: boolean;
      brokerPresent: boolean;
      terminalIdPresent: boolean;
      symbolMapEntries: number;
    };
  };
};

export type ReportArtifactSummary = {
  file: string;
  kind: "json" | "markdown";
  generatedAt: string | null;
  summary: string;
};

export type ControlRoomStatePayload = {
  timestamp: string;
  mode: {
    executionMode: string;
    breakoutEntryMode: string;
    breakoutOperatingMode: string;
    breakoutEdgeProfile: string | null;
  };
  strategies: {
    selectedActiveStrategy: string;
    activeProductionStrategyIds: string[];
    productionStrategies: string[];
    swingResearchModeEnabled: boolean;
  };
  symbols: {
    defaultSymbol: string;
    crypto: string[];
    forex: string[];
  };
  signalMode: {
    enabled: boolean;
    latestPayloadAvailable: boolean;
    latestPayload: Record<string, unknown> | null;
    notes: string;
  };
  portfolioAllocator: {
    latestRankedSetupsAvailable: boolean;
    latestDecisionsAvailable: boolean;
    notes: string;
  };
  dispatchPlans: {
    personalDemoLatestPlanAvailable: boolean;
    propDemoLatestPlanAvailable: boolean;
    notes: string;
  };
  connectors: ControlRoomConnectorReadiness;
  liveAnalysis: {
    crypto: {
      adapterPresent: boolean;
      expectedSource: string;
      timeframe: string;
    };
    forex: {
      adapterPresent: boolean;
      expectedSource: string;
      timeframe: string;
      transportConfigured: boolean;
      bridgeBaseUrlPresent: boolean;
      bridgeApiKeyPresent: boolean;
    };
    notes: string;
  };
  telegram: {
    signalOutputEnabled: boolean;
    tokenPresent: boolean;
    chatIdPresent: boolean;
    parseMode: string;
    templateReady: boolean;
    notes: string;
  };
  allocator: {
    perSymbolRiskCapPct: number;
    totalOpenRiskCapPct: number | null;
    notes: string;
  };
  governance: {
    globalKillSwitchEnabled: boolean;
    locks: {
      dailyLoss: boolean;
      trailingDrawdown: boolean;
      maxConsecutiveLoss: boolean;
    };
  };
  artifacts: {
    backtestLatestAvailable: boolean;
    backtestLatestSummary: Record<string, unknown> | null;
    validationReports: ReportArtifactSummary[];
  };
  systemStatus: {
    healthEndpoint: {
      status: "ok";
      service: "web";
    };
    incidentsAvailable: boolean;
    logsAvailable: boolean;
    notes: string;
  };
};
