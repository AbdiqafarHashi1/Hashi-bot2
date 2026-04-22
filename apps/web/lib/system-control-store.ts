import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SystemControlFile = {
  id: "system";
  isRunning: boolean;
  activeMode: "signal" | "personal" | "prop";
  killSwitchActive: boolean;
  allowedSymbols: string[];
  updatedAt: string;
};

const DEFAULT_CONTROL: SystemControlFile = {
  id: "system",
  isRunning: false,
  activeMode: "signal",
  killSwitchActive: false,
  allowedSymbols: ["ETHUSDT"],
  updatedAt: new Date(0).toISOString()
};

function filePath() {
  return path.resolve(process.cwd(), "..", "..", "runtime", "system-control.json");
}

function normalize(input: unknown): SystemControlFile {
  const payload = (input ?? {}) as Partial<SystemControlFile>;
  const activeMode = payload.activeMode === "personal" || payload.activeMode === "prop" ? payload.activeMode : "signal";
  const allowedSymbols = Array.isArray(payload.allowedSymbols)
    ? Array.from(new Set(payload.allowedSymbols.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toUpperCase()).filter(Boolean)))
    : DEFAULT_CONTROL.allowedSymbols;
  return {
    id: "system",
    isRunning: payload.isRunning === true,
    activeMode,
    killSwitchActive: payload.killSwitchActive === true,
    allowedSymbols: allowedSymbols.length > 0 ? allowedSymbols : DEFAULT_CONTROL.allowedSymbols,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString()
  };
}

export async function readSystemControlFile(): Promise<SystemControlFile> {
  const target = filePath();
  try {
    const raw = await readFile(target, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(DEFAULT_CONTROL, null, 2));
    return DEFAULT_CONTROL;
  }
}

export async function writeSystemControlFile(next: Partial<SystemControlFile>): Promise<SystemControlFile> {
  const current = await readSystemControlFile();
  const merged = normalize({ ...current, ...next, updatedAt: new Date().toISOString() });
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(merged, null, 2));
  return merged;
}
