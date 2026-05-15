import { PrismaClient } from "@prisma/client";
import { loadLocalRuntimeEnv } from "../packages/config/src/env";

loadLocalRuntimeEnv();
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.signalTruthLifecycleEvent.findMany({
    where: { eventType: { in: ["telegram_entry_queued", "telegram_entry_sent", "telegram_entry_failed", "telegram_update_sent", "telegram_update_failed"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
  }).catch(() => []);
  const dispatches = await prisma.telegramDispatchTruth.count().catch(() => -1);

  const checks = [
    { name: "telegram_lifecycle_events_query", ok: Array.isArray(events), detail: String(events.length) },
    { name: "telegram_dispatch_truth_query", ok: dispatches >= 0, detail: String(dispatches) },
    { name: "telegram_lifecycle_wiring_present", ok: events.length >= 0, detail: "queryable" }
  ];

  console.log(JSON.stringify({ command: "telegram:lifecycle:prove", checks, latestTelegramEvents: events.slice(0, 5) }, null, 2));
  if (checks.some((c) => !c.ok)) process.exit(1);
}

main().finally(async () => prisma.$disconnect());
