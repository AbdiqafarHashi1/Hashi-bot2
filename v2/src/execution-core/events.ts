import { randomUUID } from "node:crypto";
import { DurableJsonStore, clone } from "./storage";
import type { ExecutionEvent, ExecutionEventType } from "./types";
export class DurableExecutionEventBus { constructor(private readonly store = new DurableJsonStore()) {}
  publish(type: ExecutionEventType, payload: Record<string, unknown>) { return this.store.locked((s) => { const event: ExecutionEvent = { eventId: randomUUID(), sequence: s.events.length + 1, type, payload: clone(payload), timestamp: new Date().toISOString() }; s.events.push(event); return event; }); }
  replay(afterSequence = 0) { return this.store.read().events.filter((e) => e.sequence > afterSequence).map(clone); }
  clear() { this.store.locked((s) => { s.events = []; }); }
}
