import { NextResponse } from "next/server";
import { ensureControlRow, resolvePrisma } from "../_shared";
import { readRuntimeControlConfig, writeRuntimeControlConfig, type RuntimeControlConfig, type RuntimeMode } from "../../../../lib/runtime-control-config";
import { writeSystemControlFile } from "../../../../lib/system-control-store";

function normalizeSymbols(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return Array.from(new Set(value.split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean)));
}

export async function GET() {
  const [config, prisma] = await Promise.all([readRuntimeControlConfig(), resolvePrisma()]);
  const control = prisma ? await ensureControlRow(prisma) : null;
  return NextResponse.json({
    config,
    control
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Partial<RuntimeControlConfig> & {
    mode?: RuntimeMode;
    symbolsCsv?: string;
    riskPerTradePct?: number;
    maxOpenRiskPct?: number;
    baseLeverage?: number;
    maxLeverage?: number;
  };
  const current = await readRuntimeControlConfig();
  const targetMode: RuntimeMode = payload.mode === "personal" || payload.mode === "prop" ? payload.mode : "signal";
  const currentModeConfig = current.modes[targetMode];
  const updated: RuntimeControlConfig = {
    ...current,
    mode: targetMode,
    modes: {
      ...current.modes,
      [targetMode]: {
        ...currentModeConfig,
        symbols: payload.symbolsCsv !== undefined ? normalizeSymbols(payload.symbolsCsv) : currentModeConfig.symbols,
        riskPerTradePct: Number.isFinite(payload.riskPerTradePct) ? Number(payload.riskPerTradePct) : currentModeConfig.riskPerTradePct,
        maxOpenRiskPct: Number.isFinite(payload.maxOpenRiskPct) ? Number(payload.maxOpenRiskPct) : currentModeConfig.maxOpenRiskPct,
        baseLeverage: Number.isFinite(payload.baseLeverage) ? Number(payload.baseLeverage) : currentModeConfig.baseLeverage,
        maxLeverage: Number.isFinite(payload.maxLeverage) ? Number(payload.maxLeverage) : currentModeConfig.maxLeverage
      }
    }
  };
  if (updated.modes[targetMode].symbols.length === 0) {
    return NextResponse.json({ message: "symbols_required" }, { status: 400 });
  }
  const saved = await writeRuntimeControlConfig(updated);
  await writeSystemControlFile({
    activeMode: targetMode,
    allowedSymbols: saved.modes[targetMode].symbols
  });
  const prisma = await resolvePrisma();
  if (prisma) {
    const control = await ensureControlRow(prisma);
    if (control) {
      await prisma.systemControl.update({
        where: { id: control.id },
        data: {
          activeMode: targetMode,
          allowedSymbols: saved.modes[targetMode].symbols
        }
      });
    }
  }
  return NextResponse.json({ config: saved });
}
