import fs from "node:fs"; import path from "node:path";
import type { CustomerExecutionProfile, CustomerExecutionRuntimeState, ExecutionCommand, ExecutionEvent, WorkerState } from "./types";
export type Store = { profiles: CustomerExecutionProfile[]; runtime: CustomerExecutionRuntimeState[]; commands: ExecutionCommand[]; deadLetters: ExecutionCommand[]; dispatchHistory: string[]; events: ExecutionEvent[]; verificationHistory: any[]; adapterState: Record<string, any>; workerState: WorkerState[]; activeExecutionState: Record<string, any>; idempotencyRecords: Record<string, { commandId: string; createdAt: string; expiresAt?: string }>; recoveryCount: number; duplicatePreventionCount: number };
const empty = (): Store => ({ profiles: [], runtime: [], commands: [], deadLetters: [], dispatchHistory: [], events: [], verificationHistory: [], adapterState: {}, workerState: [], activeExecutionState: {}, idempotencyRecords: {}, recoveryCount: 0, duplicatePreventionCount: 0 });
export class DurableJsonStore { constructor(readonly filePath = path.join(process.cwd(), ".hashibot-v2-execution-store.json")) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); if (!fs.existsSync(filePath)) this.write(empty()); }
  locked<T>(fn: (s: Store) => T): T { const s = this.read(); const out = fn(s); this.write(s); return out; }
  read(): Store { try { return { ...empty(), ...JSON.parse(fs.readFileSync(this.filePath, "utf8")) }; } catch { return empty(); } }
  write(s: Store) { const tmp = `${this.filePath}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, this.filePath); }
  clear() { this.write(empty()); }
}
export function clone<T>(v: T): T { return structuredClone(v); }
