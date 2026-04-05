import { z } from "zod";
import type { Timeframe } from "@hashi/core";

const providerSchema = z.enum(["binance", "bybit"]);
const timeframeSchema = z.enum(["15m", "1h", "4h"] satisfies [Timeframe, ...Timeframe[]]);
const breakoutOperatingModeSchema = z.enum(["stable", "growth", "bounded_aggression"]);
const executionModeSchema = z.enum(["signal_only", "live_personal", "live_prop"]);
const execDelayModeSchema = z.enum(["none", "next_candle"]);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXT_PUBLIC_APP_NAME: z.string().default("hashi-bot2"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEFAULT_SYMBOL: z.string().default("ETHUSDT"),
  DEFAULT_EXECUTION_TIMEFRAME: timeframeSchema.default("15m"),
  DEFAULT_HTF_1: timeframeSchema.default("1h"),
  DEFAULT_HTF_2: timeframeSchema.default("4h"),
  DEFAULT_PRIMARY_PROVIDER: providerSchema.default("binance"),
  DEFAULT_BACKUP_PROVIDER: providerSchema.default("bybit"),
  DEFAULT_DATASET_PATH: z.string().default("data/ETHUSDT_15m.csv"),
  EQUITY_START: z.coerce.number().positive().default(10_000),
  EXECUTION_MODE: executionModeSchema.default("signal_only"),
  ACTIVE_PRODUCTION_STRATEGY: z.enum(["compression_breakout_balanced", "compression_breakout_strict"]).default("compression_breakout_balanced"),
  ENABLE_SWING_RESEARCH_MODE: z
    .union([z.literal("1"), z.literal("0"), z.boolean()])
    .transform((value) => value === "1" || value === true)
    .default(false),
  BREAKOUT_OPERATING_MODE: breakoutOperatingModeSchema.default("stable"),
  RISK_MODE: z.enum(["balanced", "aggressive"]).default("balanced"),
  BASE_RISK_PCT: z.coerce.number().positive().default(0.01),
  MAX_RISK_PCT_CAP: z.coerce.number().positive().default(0.025),
  SIZE_MOD_MIN: z.coerce.number().positive().default(0.7),
  SIZE_MOD_MAX: z.coerce.number().positive().default(1.2),
  MAX_POSITION_NOTIONAL: z.coerce.number().positive().optional(),
  EXEC_REALISM_ENABLED: z
    .union([z.literal("1"), z.literal("0"), z.boolean()])
    .transform((value) => value === "1" || value === true)
    .default(false),
  SLIPPAGE_PCT: z.coerce.number().min(0).default(0),
  EXEC_DELAY_MODE: execDelayModeSchema.default("none"),
  TAKER_FEE_RATE: z.coerce.number().min(0).default(0.0006)
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export const getConfig = (): RuntimeConfig => envSchema.parse(process.env);


export const DEFAULT_DATASET_PATH = "data/ETHUSDT_15m.csv";
