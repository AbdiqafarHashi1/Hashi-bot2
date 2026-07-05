import type { ExecutionEvent } from "./types";
export class InMemoryExecutionEventBus { readonly events: ExecutionEvent[] = []; publish(type: ExecutionEvent["type"], payload: Record<string, unknown>) { this.events.push({ type, payload, timestamp: new Date().toISOString() }); } clear() { this.events.length = 0; } }
