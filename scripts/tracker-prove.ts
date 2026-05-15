import { PrismaClient } from "@prisma/client";
import { loadLocalRuntimeEnv } from "../packages/config/src/env";

loadLocalRuntimeEnv();
const prisma = new PrismaClient();

async function main() {
  const unresolved = await prisma.signalTruthPosition.count({ where: { resolvedAt: null } }).catch(() => -1);
  const trackerEvents = await prisma.signalTruthLifecycleEvent.count({ where: { eventType: { in: ["entry_triggered", "tp1_hit", "tp2_hit", "tp3_hit", "stop_hit", "expired", "resolved"] } } }).catch(() => -1);
  const health = await prisma.signalTruthHealth.findFirst({ orderBy: { updatedAt: "desc" } }).catch(() => null);

  const checks = [
    { name: "tracker_positions_query", ok: unresolved >= 0, detail: String(unresolved) },
    { name: "tracker_lifecycle_events_query", ok: trackerEvents >= 0, detail: String(trackerEvents) },
    { name: "tracker_heartbeat_present", ok: Boolean(health?.lastTrackerHeartbeatAt), detail: health?.lastTrackerHeartbeatAt?.toISOString() ?? "missing" }
  ];
  console.log(JSON.stringify({ command: "tracker:prove", checks }, null, 2));
  if (checks.some((c) => !c.ok)) process.exit(1);
}

main().finally(async () => prisma.$disconnect());
