export type ActiveMode = "signal" | "personal" | "prop";

export async function resolvePrisma() {
  try {
    const { prisma } = await import("@hashi/db");
    return prisma;
  } catch {
    return null;
  }
}

export async function ensureControlRow(prisma: Awaited<ReturnType<typeof resolvePrisma>>) {
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
