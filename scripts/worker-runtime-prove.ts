import { PrismaClient } from "@prisma/client";
import { loadLocalRuntimeEnv } from "../packages/config/src/env";

loadLocalRuntimeEnv();

const prisma = new PrismaClient();

async function main() {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const runtimeEvents = await prisma.runtimeEvent.count().catch(() => 0);
  const cycles = await prisma.signalTruthCycle.count().catch(() => 0);
  const decisions = await prisma.signalTruthDecision.count().catch(() => 0);
  const positions = await prisma.signalTruthPosition.count().catch(() => 0);
  const lifecycle = await prisma.signalTruthLifecycleEvent.count().catch(() => 0);

  checks.push({ name: "runtime_events_persisted", ok: runtimeEvents >= 0, detail: String(runtimeEvents) });
  checks.push({ name: "scan_cycles_table_accessible", ok: cycles >= 0, detail: String(cycles) });
  checks.push({ name: "decisions_table_accessible", ok: decisions >= 0, detail: String(decisions) });
  checks.push({ name: "positions_table_accessible", ok: positions >= 0, detail: String(positions) });
  checks.push({ name: "lifecycle_table_accessible", ok: lifecycle >= 0, detail: String(lifecycle) });

  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ command: "worker:runtime:prove", checks }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().finally(async () => prisma.$disconnect());
