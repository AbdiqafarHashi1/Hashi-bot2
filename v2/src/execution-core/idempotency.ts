import type { CommandAction, Platform } from "./types";
export function buildIdempotencyKey(input: { signalId: string; customerId: string; executorId: string; accountId: string; adapterType: Platform; action: CommandAction; purpose: string }): string {
  return [input.signalId, input.customerId, input.executorId, input.accountId, input.adapterType, input.action, input.purpose].join("|");
}
