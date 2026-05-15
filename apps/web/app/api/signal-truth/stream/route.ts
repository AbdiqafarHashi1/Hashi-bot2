import { prisma } from '@hashi/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      let lastCreatedAt = new Date(0);
      while (!closed) {
        const events = await prisma.runtimeEvent.findMany({ where: { createdAt: { gt: lastCreatedAt } }, orderBy: { createdAt: 'asc' }, take: 50 });
        for (const e of events) {
          lastCreatedAt = e.createdAt;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    },
    cancel() { closed = true; }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
