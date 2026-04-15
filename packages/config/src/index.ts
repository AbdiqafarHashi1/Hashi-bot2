import { loadLocalRuntimeEnv } from "./env";
import { z } from "zod";
import type { Timeframe } from "@hashi/core";

const providerSchema = z.enum(["binance", "bybit"]);
const timeframeSchema = z.enum(["5m", "15m", "1h", "4h"] satisfies [Timeframe, ...Timeframe[]]);
const breakoutOperatingModeSchema = z.enum(["stable", "growth", "bounded_aggression"]);
const executionModeSchema = z.enum(["signal_only", "live_personal", "live_prop"]);
const marketTypeSchema = z.enum(["crypto", "forex"]);
const signalTierSchema = z.enum(["A+", "A", "B"]);
const signalTp1ProtectModeSchema = z.enum(["break_even", "offset_r"]);
const signalRestartPolicySchema = z.enum(["resume_persisted", "reset_signal_mode_state_on_boot"]);
const execDelayModeSchema = z.enum(["none", "next_candle"]);
const multiEngineExecutionModeSchema = z.enum(["independent", "legacy"]);
const booleanFlagSchema = z
  .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === "1" || value === "true" || value === true);
const csvSymbolsSchema = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );
const jsonRecordSchema = z
  .string()
  .default("{}")
  .transform((value) => {
    try {
      const parsed = JSON.parse(value) as Record<string, string>;
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([key, mapped]) => typeof key === "string" && typeof mapped === "string" && key.length > 0 && mapped.length > 0
        )
      );
    } catch {
      return {};
    }
  });
const optionalPositiveNumberSchema = z.preprocess(
  (value) => {
    if (value === "") {
      return undefined;
    }
    return value;
  },
  z.coerce.number().positive().optional()
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXT_PUBLIC_APP_NAME: z.string().default("hashi-bot2"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEFAULT_SYMBOL: z.string().default("ETHUSDT"),
  DEFAULT_SYMBOLS: csvSymbolsSchema.default("ETHUSDT,BTCUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT"),
  DEFAULT_CRYPTO_SYMBOLS: csvSymbolsSchema,
  DEFAULT_FOREX_SYMBOLS: csvSymbolsSchema,
  MARKET_TYPE: marketTypeSchema.default("crypto"),
  SIGNAL_MIN_TIER: signalTierSchema.default("A"),
  SIGNAL_MIN_SCORE: z.coerce.number().min(0).max(100).default(74),
  SIGNAL_REQUIRE_A_PLUS_ONLY: booleanFlagSchema.default(false),
  SIGNAL_ENABLE_CRYPTO: booleanFlagSchema.default(true),
  SIGNAL_ENABLE_FOREX: booleanFlagSchema.default(false),
  SIGNAL_FOREX_READINESS_ONLY: booleanFlagSchema.default(true),
  SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT: z.coerce.number().int().positive().default(320),
  SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS: z.coerce.number().int().positive().default(250),
  SIGNAL_DATASET_MODE_ENABLED: booleanFlagSchema.default(false),
  SIGNAL_DATASET_SYMBOL_PATHS_JSON: jsonRecordSchema,
  SIGNAL_DATASET_WINDOW_OFFSET: z.coerce.number().int().min(0).default(0),
  MAX_SIGNALS_PER_CYCLE: z.coerce.number().int().positive().default(3),
  SIGNAL_MAX_SELECTED_PER_CYCLE: z.coerce.number().int().positive().default(3),
  SIGNAL_MAX_TELEGRAM_PER_CYCLE: z.coerce.number().int().positive().default(3),
  SIGNAL_DIVERSIFICATION_ENABLED: booleanFlagSchema.default(true),
  SIGNAL_CRYPTO_DIVERSIFICATION_MODE: z.enum(["simple_groups"]).default("simple_groups"),
  SIGNAL_OUTCOME_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(21600),
  SIGNAL_MIN_TP2_R: z.coerce.number().positive().default(1.8),
  SIGNAL_MAX_ENTRY_STRETCH_ATR: z.coerce.number().positive().default(0.4),
  SIGNAL_SYMBOL_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(90),
  SIGNAL_PARTIAL_AT_TP1_ENABLED: booleanFlagSchema.default(true),
  SIGNAL_PARTIAL_PCT: z.coerce.number().min(0).max(1).default(0.5),
  SIGNAL_TP1_PROTECT_MODE: signalTp1ProtectModeSchema.default("break_even"),
  SIGNAL_TP1_PROTECT_OFFSET_R: z.coerce.number().min(0).default(0),
  SIGNAL_BREAKEVEN_BUFFER_R: z.coerce.number().min(0).default(0),
  SIGNAL_RESTART_POLICY: signalRestartPolicySchema.default("resume_persisted"),
  SIGNAL_RESET_CLEAR_RECENT_SIGNALS: booleanFlagSchema.default(false),
  SIGNAL_RESET_CLEAR_RUNTIME_EVENTS: booleanFlagSchema.default(true),
  SIGNAL_PAPER_EQUITY: z.coerce.number().positive().default(10_000),
  SIGNAL_PAPER_RISK_PCT: z.coerce.number().positive().max(1).default(0.01),
  SIGNAL_PAPER_LEVERAGE: z.coerce.number().positive().default(1),
  SIGNAL_CRYPTO_PAPER_EQUITY: z.coerce.number().positive().default(10_000),
  SIGNAL_CRYPTO_PER_TRADE_ALLOCATION: z.coerce.number().positive().default(1_000),
  SIGNAL_CRYPTO_LEVERAGE: z.coerce.number().positive().default(3),
  SIGNAL_FOREX_PAPER_EQUITY: z.coerce.number().positive().default(10_000),
  SIGNAL_FOREX_PER_TRADE_EXPOSURE_BASIS: z.coerce.number().positive().default(1_000),
  SIGNAL_FOREX_RISK_PCT: z.coerce.number().positive().max(1).default(0.01),
  SIGNAL_FOREX_LEVERAGE: z.coerce.number().positive().default(20),
  SIGNAL_FOREX_LOT_SIZE: z.coerce.number().positive().default(100_000),
  SIGNAL_FOREX_PIP_VALUE_PER_STANDARD_LOT: z.coerce.number().positive().default(10),
  SIGNAL_PAPER_MAX_TOTAL_NOTIONAL_MULT: z.coerce.number().positive().default(1),
  SIGNAL_PAPER_MAX_OPEN_RISK_PCT: z.coerce.number().positive().max(1).default(0.05),
  SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS: z.coerce.number().int().positive().default(10),
  DEFAULT_EXECUTION_TIMEFRAME: timeframeSchema.default("15m"),
  DEFAULT_HTF_1: timeframeSchema.default("1h"),
  DEFAULT_HTF_2: timeframeSchema.default("4h"),
  DEFAULT_PRIMARY_PROVIDER: providerSchema.default("binance"),
  DEFAULT_BACKUP_PROVIDER: providerSchema.default("bybit"),
  DEFAULT_DATASET_PATH: z.string().default("data/ETHUSDT_15m.csv"),
  EQUITY_START: z.coerce.number().positive().default(10_000),
  EXECUTION_MODE: executionModeSchema.default("signal_only"),
  MULTI_ENGINE_EXECUTION_MODE: multiEngineExecutionModeSchema.default("independent"),
  ACTIVE_PRODUCTION_STRATEGY: z.enum(["compression_breakout_balanced", "compression_breakout_strict"]).default("compression_breakout_balanced"),
  SIGNAL_ENABLE_ENGINE2: booleanFlagSchema.default(true),
  ENGINE2_STRATEGY: z.enum(["expansion_reload_v2_wide"]).default("expansion_reload_v2_wide"),
  ENGINE2_MIN_SCORE: z.coerce.number().min(0).max(100).default(54),
  ENGINE2_RANKING_BIAS: z.coerce.number().min(-20).max(20).default(0),
  SIGNAL_ENABLE_ENGINE3: booleanFlagSchema.default(true),
  ENGINE3_STRATEGY: z.enum(["continuation_reclaim_5m_v1"]).default("continuation_reclaim_5m_v1"),
  ENGINE3_MIN_SCORE: z.coerce.number().min(0).max(100).default(52),
  ENGINE3_RANKING_BIAS: z.coerce.number().min(-20).max(20).default(0),
  ENABLE_SWING_RESEARCH_MODE: booleanFlagSchema.default(false),
  BREAKOUT_OPERATING_MODE: breakoutOperatingModeSchema.default("stable"),
  RISK_MODE: z.enum(["balanced", "aggressive"]).default("balanced"),
  BASE_RISK_PCT: z.coerce.number().positive().default(0.01),
  MAX_RISK_PCT_CAP: z.coerce.number().positive().default(0.025),
  SIZE_MOD_MIN: z.coerce.number().positive().default(0.7),
  SIZE_MOD_MAX: z.coerce.number().positive().default(1.2),
  MAX_POSITION_NOTIONAL: optionalPositiveNumberSchema,
  EXEC_REALISM_ENABLED: booleanFlagSchema.default(false),
  SLIPPAGE_PCT: z.coerce.number().min(0).default(0),
  EXEC_DELAY_MODE: execDelayModeSchema.default("none"),
  TAKER_FEE_RATE: z.coerce.number().min(0).default(0.0006),
  PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT: z.coerce.number().positive().default(0.75),
  PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT: z.coerce.number().positive().default(0.4),
  GLOBAL_KILL_SWITCH_ENABLED: booleanFlagSchema.default(false),
  GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE: booleanFlagSchema.default(false),
  GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE: booleanFlagSchema.default(false),
  GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE: booleanFlagSchema.default(false),
  ENABLE_SIGNAL_MODE_OUTPUT: booleanFlagSchema.default(false),
  WORKER_LOOP_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  WORKER_DEBUG_VISIBILITY: booleanFlagSchema.default(false),
  ENABLE_PERSONAL_DEMO_CONNECTOR: booleanFlagSchema.default(true),
  ENABLE_PROP_DEMO_CONNECTOR: booleanFlagSchema.default(true),
  SKIP_INFRA_CHECKS: booleanFlagSchema.default(false),
  BREAKOUT_EDGE_PROFILE: z.enum(["baseline", "reinforced"]).default("reinforced"),
  BREAKOUT_ENTRY_MODE: z.enum(["signal", "personal", "prop"]).default("signal"),
  PERSONAL_THROUGHPUT_EXPANSION: booleanFlagSchema.default(false),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_PARSE_MODE: z.enum(["Markdown", "MarkdownV2", "HTML"]).default("Markdown"),
  BINANCE_DEMO_API_KEY: z.string().optional(),
  BINANCE_DEMO_API_SECRET: z.string().optional(),
  BINANCE_DEMO_BASE_URL: z.string().default("https://testnet.binancefuture.com"),
  BINANCE_DEMO_SYMBOL_MAP_JSON: jsonRecordSchema,
  MT5_DEMO_LOGIN: z.string().optional(),
  MT5_DEMO_PASSWORD: z.string().optional(),
  MT5_DEMO_SERVER: z.string().optional(),
  MT5_DEMO_BROKER: z.string().optional(),
  MT5_DEMO_TERMINAL_ID: z.string().optional(),
  MT5_DEMO_SYMBOL_MAP_JSON: jsonRecordSchema,
  MT5_BRIDGE_BASE_URL: z.string().optional(),
  MT5_BRIDGE_API_KEY: z.string().optional()
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export const getConfig = (): RuntimeConfig => {
  loadLocalRuntimeEnv();
  return envSchema.parse(process.env);
};


export const DEFAULT_DATASET_PATH = "data/ETHUSDT_15m.csv";


export { loadLocalRuntimeEnv };
