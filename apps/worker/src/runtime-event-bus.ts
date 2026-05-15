import type { PrismaClient } from '@prisma/client';

export type RuntimeEventCategory = 'scanner'|'tracker'|'lifecycle'|'dispatch'|'incident'|'runtime_health'|'strategy'|'control_plane'|'deployment';
export type RuntimeEventEnvelope = { category: RuntimeEventCategory; type: string; mode: string; message?: string; payload?: Record<string, unknown>; symbol?: string; occurredAt?: string };

export async function emitRuntimeEvent(prisma: PrismaClient, event: RuntimeEventEnvelope) {
  await prisma.runtimeEvent.create({
    data: {
      type: `${event.category}.${event.type}`,
      mode: event.mode,
      symbol: event.symbol,
      message: event.message,
      payload: { ...(event.payload ?? {}), occurredAt: event.occurredAt ?? new Date().toISOString(), category: event.category }
    }
  });
}
