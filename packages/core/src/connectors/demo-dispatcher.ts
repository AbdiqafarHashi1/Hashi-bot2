import type { AllocationDecision } from "../execution/portfolio-allocator";
import type { GovernanceLocks } from "../execution/breakout-execution-policy";
import {
  buildPersonalDemoLifecyclePlan,
  buildPersonalDemoOrderIntent,
  type BinanceDemoConnectorConfig
} from "./personal-binance-demo";
import {
  buildPropDemoLifecyclePlan,
  buildPropDemoOrderIntent,
  type Mt5DemoConnectorConfig
} from "./prop-mt5-demo";

export type PersonalDemoDispatchItem = {
  intent: ReturnType<typeof buildPersonalDemoOrderIntent>;
  lifecycle: ReturnType<typeof buildPersonalDemoLifecyclePlan> | null;
};

export type PropDemoDispatchItem = {
  intent: ReturnType<typeof buildPropDemoOrderIntent>["intent"];
  blockedReason: ReturnType<typeof buildPropDemoOrderIntent>["blockedReason"];
  lifecycle: ReturnType<typeof buildPropDemoLifecyclePlan> | null;
};

export function buildPersonalDemoDispatchPlan(decisions: AllocationDecision[], config: BinanceDemoConnectorConfig): PersonalDemoDispatchItem[] {
  return decisions.map((decision) => {
    const intent = buildPersonalDemoOrderIntent(decision, config);
    return {
      intent,
      lifecycle: intent ? buildPersonalDemoLifecyclePlan(intent) : null
    };
  });
}

export function buildPropDemoDispatchPlan(
  decisions: AllocationDecision[],
  config: Mt5DemoConnectorConfig,
  governanceLocks?: GovernanceLocks
): PropDemoDispatchItem[] {
  return decisions.map((decision) => {
    const { intent, blockedReason } = buildPropDemoOrderIntent(decision, config, { governanceLocks });
    return {
      intent,
      blockedReason,
      lifecycle: intent ? buildPropDemoLifecyclePlan(intent) : null
    };
  });
}
