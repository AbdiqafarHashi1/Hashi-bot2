import { z } from "zod";
import type { Timeframe } from "@hashi/core";

const providerSchema = z.enum(["binance", "bybit"]);
const timeframeSchema = z.enum(["15m", "1h", "4h"] satisfies [Timeframe, ...Timeframe[]]);

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
  DEFAULT_DATASET_PATH: z.string().default("data/ETHUSDT_15m.csv")
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export const getConfig = (): RuntimeConfig => envSchema.parse(process.env);


export const DEFAULT_DATASET_PATH = "data/ETHUSDT_15m.csv";
