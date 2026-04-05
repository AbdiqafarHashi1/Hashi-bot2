import { promises as fs } from "node:fs";
import path from "node:path";
import { getConfig } from "@hashi/config";
import type { ControlRoomStatePayload, ReportArtifactSummary } from "./contracts";

type LooseRuntimeConfig = {
  EXECUTION_MODE: string;
  BREAKOUT_ENTRY_MODE: string;
  BREAKOUT_OPERATING_MODE: string;
  BREAKOUT_EDGE_PROFILE?: string;
  ACTIVE_PRODUCTION_STRATEGY: string;
  ENABLE_SWING_RESEARCH_MODE: boolean;
  DEFAULT_SYMBOL: string;
  DEFAULT_CRYPTO_SYMBOLS: string[];
  DEFAULT_FOREX_SYMBOLS: string[];
  ENABLE_SIGNAL_MODE_OUTPUT: boolean;
  ENABLE_PERSONAL_DEMO_CONNECTOR: boolean;
  ENABLE_PROP_DEMO_CONNECTOR: boolean;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_PARSE_MODE?: string;
  BINANCE_DEMO_API_KEY?: string;
  BINANCE_DEMO_API_SECRET?: string;
  BINANCE_DEMO_BASE_URL?: string;
  BINANCE_DEMO_SYMBOL_MAP_JSON: Record<string, unknown>;
  MT5_DEMO_LOGIN?: string;
  MT5_DEMO_PASSWORD?: string;
  MT5_DEMO_SERVER?: string;
  MT5_DEMO_BROKER?: string;
  MT5_DEMO_TERMINAL_ID?: string;
  MT5_DEMO_SYMBOL_MAP_JSON: Record<string, unknown>;
  MT5_BRIDGE_BASE_URL?: string;
  MT5_BRIDGE_API_KEY?: string;
  GLOBAL_KILL_SWITCH_ENABLED: boolean;
  GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE: boolean;
  GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE: boolean;
  GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE: boolean;
  PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT?: number;
  PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT?: number;
};

const DEFAULTS: LooseRuntimeConfig = {
  EXECUTION_MODE: "signal_only",
  BREAKOUT_ENTRY_MODE: "signal",
  BREAKOUT_OPERATING_MODE: "stable",
  BREAKOUT_EDGE_PROFILE: process.env.BREAKOUT_EDGE_PROFILE,
  ACTIVE_PRODUCTION_STRATEGY: "compression_breakout_balanced",
  ENABLE_SWING_RESEARCH_MODE: false,
  DEFAULT_SYMBOL: "ETHUSDT",
  DEFAULT_CRYPTO_SYMBOLS: [],
  DEFAULT_FOREX_SYMBOLS: [],
  ENABLE_SIGNAL_MODE_OUTPUT: true,
  ENABLE_PERSONAL_DEMO_CONNECTOR: true,
  ENABLE_PROP_DEMO_CONNECTOR: true,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_PARSE_MODE: process.env.TELEGRAM_PARSE_MODE ?? "Markdown",
  BINANCE_DEMO_API_KEY: process.env.BINANCE_DEMO_API_KEY,
  BINANCE_DEMO_API_SECRET: process.env.BINANCE_DEMO_API_SECRET,
  BINANCE_DEMO_BASE_URL: process.env.BINANCE_DEMO_BASE_URL,
  BINANCE_DEMO_SYMBOL_MAP_JSON: parseRecord(process.env.BINANCE_DEMO_SYMBOL_MAP_JSON),
  MT5_DEMO_LOGIN: process.env.MT5_DEMO_LOGIN,
  MT5_DEMO_PASSWORD: process.env.MT5_DEMO_PASSWORD,
  MT5_DEMO_SERVER: process.env.MT5_DEMO_SERVER,
  MT5_DEMO_BROKER: process.env.MT5_DEMO_BROKER,
  MT5_DEMO_TERMINAL_ID: process.env.MT5_DEMO_TERMINAL_ID,
  MT5_DEMO_SYMBOL_MAP_JSON: parseRecord(process.env.MT5_DEMO_SYMBOL_MAP_JSON),
  MT5_BRIDGE_BASE_URL: process.env.MT5_BRIDGE_BASE_URL,
  MT5_BRIDGE_API_KEY: process.env.MT5_BRIDGE_API_KEY,
  GLOBAL_KILL_SWITCH_ENABLED: toBoolean(process.env.GLOBAL_KILL_SWITCH_ENABLED),
  GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE: toBoolean(process.env.GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE),
  GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE: toBoolean(process.env.GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE),
  GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE: toBoolean(process.env.GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE),
  PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT: Number(process.env.PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT ?? 0.75),
  PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT: Number(process.env.PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT ?? 0.4)
};

function parseRecord(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string" && key.length > 0 && value.length > 0
      )
    );
  } catch {
    return {};
  }
}

function toBoolean(raw: string | boolean | undefined): boolean {
  return raw === true || raw === "1" || raw === "true";
}

function toCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function resolveConfig(): LooseRuntimeConfig {
  try {
    return getConfig();
  } catch {
    return {
      ...DEFAULTS,
      EXECUTION_MODE: process.env.EXECUTION_MODE ?? DEFAULTS.EXECUTION_MODE,
      BREAKOUT_ENTRY_MODE: process.env.BREAKOUT_ENTRY_MODE ?? DEFAULTS.BREAKOUT_ENTRY_MODE,
      BREAKOUT_OPERATING_MODE: process.env.BREAKOUT_OPERATING_MODE ?? DEFAULTS.BREAKOUT_OPERATING_MODE,
      BREAKOUT_EDGE_PROFILE: process.env.BREAKOUT_EDGE_PROFILE ?? DEFAULTS.BREAKOUT_EDGE_PROFILE,
      ACTIVE_PRODUCTION_STRATEGY: process.env.ACTIVE_PRODUCTION_STRATEGY ?? DEFAULTS.ACTIVE_PRODUCTION_STRATEGY,
      ENABLE_SWING_RESEARCH_MODE: toBoolean(process.env.ENABLE_SWING_RESEARCH_MODE),
      DEFAULT_SYMBOL: process.env.DEFAULT_SYMBOL ?? DEFAULTS.DEFAULT_SYMBOL,
      DEFAULT_CRYPTO_SYMBOLS: toCsv(process.env.DEFAULT_CRYPTO_SYMBOLS),
      DEFAULT_FOREX_SYMBOLS: toCsv(process.env.DEFAULT_FOREX_SYMBOLS),
      ENABLE_SIGNAL_MODE_OUTPUT: process.env.ENABLE_SIGNAL_MODE_OUTPUT
        ? toBoolean(process.env.ENABLE_SIGNAL_MODE_OUTPUT)
        : DEFAULTS.ENABLE_SIGNAL_MODE_OUTPUT,
      ENABLE_PERSONAL_DEMO_CONNECTOR: process.env.ENABLE_PERSONAL_DEMO_CONNECTOR
        ? toBoolean(process.env.ENABLE_PERSONAL_DEMO_CONNECTOR)
        : DEFAULTS.ENABLE_PERSONAL_DEMO_CONNECTOR,
      ENABLE_PROP_DEMO_CONNECTOR: process.env.ENABLE_PROP_DEMO_CONNECTOR
        ? toBoolean(process.env.ENABLE_PROP_DEMO_CONNECTOR)
        : DEFAULTS.ENABLE_PROP_DEMO_CONNECTOR,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
      TELEGRAM_PARSE_MODE: process.env.TELEGRAM_PARSE_MODE ?? DEFAULTS.TELEGRAM_PARSE_MODE,
      BINANCE_DEMO_API_KEY: process.env.BINANCE_DEMO_API_KEY,
      BINANCE_DEMO_API_SECRET: process.env.BINANCE_DEMO_API_SECRET,
      BINANCE_DEMO_BASE_URL: process.env.BINANCE_DEMO_BASE_URL,
      BINANCE_DEMO_SYMBOL_MAP_JSON: parseRecord(process.env.BINANCE_DEMO_SYMBOL_MAP_JSON),
      MT5_DEMO_LOGIN: process.env.MT5_DEMO_LOGIN,
      MT5_DEMO_PASSWORD: process.env.MT5_DEMO_PASSWORD,
      MT5_DEMO_SERVER: process.env.MT5_DEMO_SERVER,
      MT5_DEMO_BROKER: process.env.MT5_DEMO_BROKER,
      MT5_DEMO_TERMINAL_ID: process.env.MT5_DEMO_TERMINAL_ID,
      MT5_DEMO_SYMBOL_MAP_JSON: parseRecord(process.env.MT5_DEMO_SYMBOL_MAP_JSON),
      MT5_BRIDGE_BASE_URL: process.env.MT5_BRIDGE_BASE_URL,
      MT5_BRIDGE_API_KEY: process.env.MT5_BRIDGE_API_KEY,
      GLOBAL_KILL_SWITCH_ENABLED: toBoolean(process.env.GLOBAL_KILL_SWITCH_ENABLED),
      GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE: toBoolean(process.env.GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE),
      GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE: toBoolean(process.env.GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE),
      GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE: toBoolean(process.env.GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE),
      PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT: Number(
        process.env.PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT ?? DEFAULTS.PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT
      ),
      PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT: Number(
        process.env.PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT ?? DEFAULTS.PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT
      )
    };
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readBacktestSummary(repoRoot: string) {
  const latest = await readJsonFile(path.join(repoRoot, "runtime/backtests/latest.json"));
  if (!latest) {
    return {
      backtestLatestAvailable: false,
      backtestLatestSummary: null
    } as const;
  }

  return {
    backtestLatestAvailable: true,
    backtestLatestSummary: {
      generatedAt: latest.generatedAt,
      summary: latest.summary,
      tradeCount: Array.isArray(latest.trades) ? latest.trades.length : 0,
      analyticsKeys: latest.analytics && typeof latest.analytics === "object" ? Object.keys(latest.analytics as object) : []
    }
  } as const;
}

function toReportSummary(file: string, content: Record<string, unknown>): ReportArtifactSummary {
  return {
    file,
    kind: "json",
    generatedAt: typeof content.generatedAt === "string" ? content.generatedAt : null,
    summary: [
      typeof content.verdict === "string" ? `verdict=${content.verdict}` : null,
      Array.isArray(content.scenarios) ? `scenarios=${content.scenarios.length}` : null,
      Array.isArray(content.personal) ? `personalVariants=${content.personal.length}` : null,
      Array.isArray(content.prop) ? `propVariants=${content.prop.length}` : null,
      content.combined && typeof content.combined === "object" ? "includesCombinedMetrics=true" : null
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join("; ") || "json report present"
  };
}

async function readReportArtifacts(repoRoot: string): Promise<ReportArtifactSummary[]> {
  const reportsDir = path.join(repoRoot, "reports");
  const entries = await fs.readdir(reportsDir, { withFileTypes: true }).catch(() => []);
  const summaries: ReportArtifactSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;
    const fullPath = path.join(reportsDir, fileName);

    if (fileName.endsWith(".json")) {
      const content = await readJsonFile(fullPath);
      if (content) {
        summaries.push(toReportSummary(path.posix.join("reports", fileName), content));
      }
      continue;
    }

    if (fileName.endsWith(".md")) {
      const raw = await fs.readFile(fullPath, "utf8").catch(() => "");
      summaries.push({
        file: path.posix.join("reports", fileName),
        kind: "markdown",
        generatedAt: null,
        summary: raw.split("\n").find((line) => line.startsWith("#"))?.replace(/^#+\s*/, "") ?? "markdown report present"
      });
    }
  }

  summaries.sort((a, b) => a.file.localeCompare(b.file));
  return summaries;
}

export async function buildControlRoomState(): Promise<ControlRoomStatePayload> {
  const config = resolveConfig();
  const repoRoot = path.resolve(process.cwd(), "../..");
  const [backtest, validationReports] = await Promise.all([
    readBacktestSummary(repoRoot),
    readReportArtifacts(repoRoot)
  ]);

  const activeProductionStrategyIds = ["compression_breakout_balanced", "compression_breakout_strict"] as const;
  const productionStrategies = config.ENABLE_SWING_RESEARCH_MODE
    ? [...activeProductionStrategyIds, "combined_breakout_swing_arbitrated"]
    : [...activeProductionStrategyIds];

  const missingPersonalCredentials = [
    !config.BINANCE_DEMO_API_KEY ? "BINANCE_DEMO_API_KEY" : null,
    !config.BINANCE_DEMO_API_SECRET ? "BINANCE_DEMO_API_SECRET" : null
  ].filter((value): value is string => Boolean(value));

  const missingPropCredentials = [
    !config.MT5_DEMO_LOGIN ? "MT5_DEMO_LOGIN" : null,
    !config.MT5_DEMO_PASSWORD ? "MT5_DEMO_PASSWORD" : null
  ].filter((value): value is string => Boolean(value));

  return {
    timestamp: new Date().toISOString(),
    mode: {
      executionMode: config.EXECUTION_MODE,
      breakoutEntryMode: config.BREAKOUT_ENTRY_MODE,
      breakoutOperatingMode: config.BREAKOUT_OPERATING_MODE,
      breakoutEdgeProfile: config.BREAKOUT_EDGE_PROFILE ?? null
    },
    strategies: {
      selectedActiveStrategy: config.ACTIVE_PRODUCTION_STRATEGY,
      activeProductionStrategyIds: [...activeProductionStrategyIds],
      productionStrategies,
      swingResearchModeEnabled: config.ENABLE_SWING_RESEARCH_MODE
    },
    symbols: {
      defaultSymbol: config.DEFAULT_SYMBOL,
      crypto: config.DEFAULT_CRYPTO_SYMBOLS,
      forex: config.DEFAULT_FOREX_SYMBOLS
    },
    signalMode: {
      enabled: config.EXECUTION_MODE === "signal_only" && config.ENABLE_SIGNAL_MODE_OUTPUT,
      latestPayloadAvailable: false,
      latestPayload: null,
      notes: "No persisted signal-mode payload artifact is currently written to runtime/ in this phase."
    },
    portfolioAllocator: {
      latestRankedSetupsAvailable: false,
      latestDecisionsAvailable: false,
      notes: "Allocator ranked setups/decisions are emitted by worker logs but not persisted as UI-readable artifacts yet."
    },
    dispatchPlans: {
      personalDemoLatestPlanAvailable: false,
      propDemoLatestPlanAvailable: false,
      notes: "Dispatch plans are computed in worker cycle logs and are not yet persisted for web retrieval."
    },
    connectors: {
      personalDemo: {
        enabled: config.ENABLE_PERSONAL_DEMO_CONNECTOR,
        credentials: {
          configured: missingPersonalCredentials.length === 0,
          missing: missingPersonalCredentials
        },
        transport: {
          baseUrlPresent: Boolean(config.BINANCE_DEMO_BASE_URL),
          symbolMapEntries: Object.keys(config.BINANCE_DEMO_SYMBOL_MAP_JSON).length
        }
      },
      propDemo: {
        enabled: config.ENABLE_PROP_DEMO_CONNECTOR,
        credentials: {
          configured: missingPropCredentials.length === 0,
          missing: missingPropCredentials
        },
        transport: {
          serverPresent: Boolean(config.MT5_DEMO_SERVER),
          brokerPresent: Boolean(config.MT5_DEMO_BROKER),
          terminalIdPresent: Boolean(config.MT5_DEMO_TERMINAL_ID),
          symbolMapEntries: Object.keys(config.MT5_DEMO_SYMBOL_MAP_JSON).length
        }
      }
    },
    liveAnalysis: {
      crypto: {
        adapterPresent: true,
        expectedSource: "binance_spot/bybit_spot",
        timeframe: "15m"
      },
      forex: {
        adapterPresent: true,
        expectedSource: "mt5_bridge",
        timeframe: "15m",
        transportConfigured: Boolean(config.MT5_BRIDGE_BASE_URL),
        bridgeBaseUrlPresent: Boolean(config.MT5_BRIDGE_BASE_URL),
        bridgeApiKeyPresent: Boolean(config.MT5_BRIDGE_API_KEY)
      },
      notes:
        "Adapters are wired for live analysis. Forex path requires MT5 bridge transport; unavailable symbols are skipped without fake signals."
    },
    telegram: {
      signalOutputEnabled: config.ENABLE_SIGNAL_MODE_OUTPUT,
      tokenPresent: Boolean(config.TELEGRAM_BOT_TOKEN),
      chatIdPresent: Boolean(config.TELEGRAM_CHAT_ID),
      parseMode: config.TELEGRAM_PARSE_MODE ?? "Markdown",
      templateReady: true,
      notes: "Signal mode publishes message payloads only; non-executing by design in signal-only mode."
    },
    allocator: {
      perSymbolRiskCapPct:
        config.EXECUTION_MODE === "live_prop"
          ? Number(config.PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT ?? 0.4)
          : Number(config.PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT ?? 0.75),
      totalOpenRiskCapPct: null,
      notes: "Total open-risk cap is mode-governed in execution policy; explicit numeric cap is not persisted in web snapshot yet."
    },
    governance: {
      globalKillSwitchEnabled: config.GLOBAL_KILL_SWITCH_ENABLED,
      locks: {
        dailyLoss: config.GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE,
        trailingDrawdown: config.GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE,
        maxConsecutiveLoss: config.GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE
      }
    },
    artifacts: {
      ...backtest,
      validationReports
    },
    systemStatus: {
      healthEndpoint: {
        status: "ok",
        service: "web"
      },
      incidentsAvailable: false,
      logsAvailable: false,
      notes: "No dedicated incidents/log snapshot file is currently exposed by the worker for web consumption."
    }
  };
}
