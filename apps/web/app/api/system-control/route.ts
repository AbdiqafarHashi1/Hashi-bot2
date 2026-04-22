import { NextResponse } from "next/server";
import { readSystemControlFile, writeSystemControlFile } from "../../../lib/system-control-store";

type ActiveMode = "signal" | "personal" | "prop";

function normalizeAllowedSymbols(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  return normalized;
}

async function resolvePrisma() {
  try {
    const { prisma } = await import("@hashi/db");
    return prisma;
  } catch {
    return null;
  }
}

async function ensureControlRow(prisma: Awaited<ReturnType<typeof resolvePrisma>>) {
  if (!prisma) return null;
  return prisma.systemControl.upsert({
    where: { id: "system" },
    update: {},
    create: {
      id: "system",
      isRunning: false,
      activeMode: "signal",
      killSwitchActive: false,
      allowedSymbols: ["ETHUSDT"]
    }
  });
}

export async function GET() {
  const prisma = await resolvePrisma();
  if (!prisma) return NextResponse.json({ control: await readSystemControlFile() });
  const control = await ensureControlRow(prisma);
  if (!control) return NextResponse.json({ control: await readSystemControlFile() });
  return NextResponse.json({ control });
}

export async function POST(request: Request) {
  const prisma = await resolvePrisma();

  const payload = (await request.json().catch(() => ({}))) as {
    isRunning?: unknown;
    activeMode?: unknown;
    killSwitchActive?: unknown;
    allowedSymbols?: unknown;
  };

  const updateData: {
    isRunning?: boolean;
    activeMode?: ActiveMode;
    killSwitchActive?: boolean;
    allowedSymbols?: string[];
  } = {};

  if (payload.isRunning !== undefined) {
    if (typeof payload.isRunning !== "boolean") {
      return NextResponse.json({ message: "isRunning must be a boolean" }, { status: 400 });
    }
    updateData.isRunning = payload.isRunning;
  }

  if (payload.killSwitchActive !== undefined) {
    if (typeof payload.killSwitchActive !== "boolean") {
      return NextResponse.json({ message: "killSwitchActive must be a boolean" }, { status: 400 });
    }
    updateData.killSwitchActive = payload.killSwitchActive;
  }

  if (payload.activeMode !== undefined) {
    if (payload.activeMode !== "signal" && payload.activeMode !== "personal" && payload.activeMode !== "prop") {
      return NextResponse.json({ message: "activeMode must be one of signal|personal|prop" }, { status: 400 });
    }
    updateData.activeMode = payload.activeMode;
  }

  if (payload.allowedSymbols !== undefined) {
    const normalized = normalizeAllowedSymbols(payload.allowedSymbols);
    if (!normalized || normalized.length === 0) {
      return NextResponse.json({ message: "allowedSymbols must be a non-empty string array" }, { status: 400 });
    }
    updateData.allowedSymbols = normalized;
  }

  if (!prisma) {
    const control = await writeSystemControlFile(updateData);
    return NextResponse.json({ control });
  }

  const existing = await ensureControlRow(prisma);
  if (!existing) {
    const control = await writeSystemControlFile(updateData);
    return NextResponse.json({ control });
  }
  const control = await prisma.systemControl.update({
    where: { id: existing.id },
    data: updateData
  });

  await prisma.runtimeEvent.create({
    data: {
      type: "control_update",
      mode: control.activeMode,
      message: "System control updated",
      payload: {
        changes: updateData,
        updatedAt: control.updatedAt
      }
    }
  });

  await writeSystemControlFile({
    id: "system",
    isRunning: control.isRunning,
    activeMode: control.activeMode as ActiveMode,
    killSwitchActive: control.killSwitchActive,
    allowedSymbols: control.allowedSymbols,
    updatedAt: control.updatedAt.toISOString()
  });

  return NextResponse.json({ control });
}
