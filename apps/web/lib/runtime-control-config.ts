import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type RuntimeMode = "signal" | "personal" | "prop";
export type RuntimeDataSource = "live" | "replay";

export type RuntimeModeConfig = {
  symbols: string[];
  riskPerTradePct: number;
  maxOpenRiskPct: number;
  baseLeverage: number;
  maxLeverage: number;
};

export type RuntimeControlConfig = {
  mode: RuntimeMode;
  dataSource: RuntimeDataSource;
  replayDatasetPath?: string;
  signalMode: {
    minimumTier: "A" | "A+";
    dailySignalTarget: number;
    symbolCooldownMinutes: number;
    globalCooldownMinutes: number;
    relaxationEnabled: boolean;
  };
  modes: Record<RuntimeMode, RuntimeModeConfig>;
  enginePhaseLock: "engine1_only";
  updatedAt: string;
};

const DEFAULT_REPLAY_DATASET_PATH = "data/datasets/ETHUSDT_15m.csv";

const DEFAULT_CONFIG: RuntimeControlConfig = {
  mode: "signal",
  dataSource: "live",
  replayDatasetPath: DEFAULT_REPLAY_DATASET_PATH,
  signalMode: {
    minimumTier: "A",
    dailySignalTarget: 2,
    symbolCooldownMinutes: 90,
    globalCooldownMinutes: 20,
    relaxationEnabled: true
  },
  enginePhaseLock: "engine1_only",
  updatedAt: new Date(0).toISOString(),
  modes: {
    signal: {
      symbols: ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT"],
      riskPerTradePct: 0.5,
      maxOpenRiskPct: 1.5,
      baseLeverage: 5,
      maxLeverage: 8
    },
    personal: {
      symbols: ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "LINKUSDT"],
      riskPerTradePct: 0.5,
      maxOpenRiskPct: 1.5,
      baseLeverage: 5,
      maxLeverage: 8
    },
    prop: {
      symbols: ["ETHUSDT", "BTCUSDT", "SOLUSDT"],
      riskPerTradePct: 0.25,
      maxOpenRiskPct: 0.75,
      baseLeverage: 2,
      maxLeverage: 4
    }
  }
};

function normalizeSymbols(value: unknown): string[] {
  if (typeof value === "string") {
    return Array.from(new Set(value.split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean)));
  }
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toUpperCase()).filter(Boolean)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeModeConfig(input: unknown, fallback: RuntimeModeConfig): RuntimeModeConfig {
  const payload = (input ?? {}) as Partial<RuntimeModeConfig>;
  return {
    symbols: normalizeSymbols(payload.symbols).length > 0 ? normalizeSymbols(payload.symbols) : fallback.symbols,
    riskPerTradePct: clamp(Number(payload.riskPerTradePct ?? fallback.riskPerTradePct), 0.05, 5),
    maxOpenRiskPct: clamp(Number(payload.maxOpenRiskPct ?? fallback.maxOpenRiskPct), 0.1, 10),
    baseLeverage: clamp(Number(payload.baseLeverage ?? fallback.baseLeverage), 1, 20),
    maxLeverage: clamp(Number(payload.maxLeverage ?? fallback.maxLeverage), 1, 25)
  };
}

function normalizeConfig(input: unknown): RuntimeControlConfig {
  const payload = (input ?? {}) as Partial<RuntimeControlConfig>;
  const mode = payload.mode === "personal" || payload.mode === "prop" ? payload.mode : "signal";
  const dataSource = payload.dataSource === "replay" ? "replay" : "live";
  const replayDatasetPath = typeof payload.replayDatasetPath === "string" && payload.replayDatasetPath.trim().length > 0
    ? payload.replayDatasetPath.trim()
    : DEFAULT_REPLAY_DATASET_PATH;
  const signalModePayload = (payload.signalMode ?? {}) as Partial<RuntimeControlConfig["signalMode"]>;
  const modesPayload = (payload.modes ?? {}) as Partial<Record<RuntimeMode, RuntimeModeConfig>>;
  return {
    mode,
    dataSource,
    replayDatasetPath,
    signalMode: {
      minimumTier: signalModePayload.minimumTier === "A+" ? "A+" : "A",
      dailySignalTarget: clamp(Number(signalModePayload.dailySignalTarget ?? 2), 1, 5),
      symbolCooldownMinutes: clamp(Number(signalModePayload.symbolCooldownMinutes ?? 90), 15, 240),
      globalCooldownMinutes: clamp(Number(signalModePayload.globalCooldownMinutes ?? 20), 5, 120),
      relaxationEnabled: signalModePayload.relaxationEnabled !== false
    },
    enginePhaseLock: "engine1_only",
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
    modes: {
      signal: normalizeModeConfig(modesPayload.signal, DEFAULT_CONFIG.modes.signal),
      personal: normalizeModeConfig(modesPayload.personal, DEFAULT_CONFIG.modes.personal),
      prop: normalizeModeConfig(modesPayload.prop, DEFAULT_CONFIG.modes.prop)
    }
  };
}

function configPath() {
  return path.resolve(process.cwd(), "..", "..", "runtime", "control-config.json");
}

export async function readRuntimeControlConfig(): Promise<RuntimeControlConfig> {
  const filePath = configPath();
  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
}

export async function writeRuntimeControlConfig(next: RuntimeControlConfig): Promise<RuntimeControlConfig> {
  const normalized = normalizeConfig({ ...next, updatedAt: new Date().toISOString() });
  const filePath = configPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(normalized, null, 2));
  return normalized;
}
