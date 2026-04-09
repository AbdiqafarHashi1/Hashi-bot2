import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let hasLoadedLocalRuntimeEnv = false;

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    const marker = path.join(current, "pnpm-workspace.yaml");
    if (existsSync(marker)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }

    current = parent;
  }
}

function parseEnvFile(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const delimiterIndex = trimmed.indexOf("=");
    if (delimiterIndex < 1) continue;

    const key = trimmed.slice(0, delimiterIndex).trim();
    let value = trimmed.slice(delimiterIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function loadLocalRuntimeEnv(): void {
  if (hasLoadedLocalRuntimeEnv) return;
  hasLoadedLocalRuntimeEnv = true;

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const configuredEnvFile = process.env.HASHI_ENV_FILE?.trim();
  const envPath = configuredEnvFile
    ? path.isAbsolute(configuredEnvFile)
      ? configuredEnvFile
      : path.join(workspaceRoot, configuredEnvFile)
    : path.join(workspaceRoot, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  const parsed = parseEnvFile(raw);

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
