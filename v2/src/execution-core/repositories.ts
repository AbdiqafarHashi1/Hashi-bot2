import type { CustomerExecutionProfile, CustomerExecutionRuntimeState } from "./types";
export class InMemoryExecutionRepository {
  private profiles = new Map<string, CustomerExecutionProfile>();
  private runtime = new Map<string, CustomerExecutionRuntimeState>();
  private history = new Set<string>();
  saveProfile(profile: CustomerExecutionProfile) { this.profiles.set(profile.customerId, structuredClone(profile)); }
  listProfiles() { return [...this.profiles.values()].map((p) => structuredClone(p)); }
  getRuntime(customerId: string) { return this.runtime.get(customerId); }
  recordDispatch(key: string) { this.history.add(key); }
  hasDispatched(key: string) { return this.history.has(key); }
  clear() { this.profiles.clear(); this.runtime.clear(); this.history.clear(); }
}
