//+------------------------------------------------------------------+
//| PersonalEA.mq5: Aggressive version of HashiBot                  |
//| DRY-RUN ONLY | NO LIVE EXECUTION | Strategy Tester compile target               |
//+------------------------------------------------------------------+
#property copyright "HashiBot"
#property version   "1.10"

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Core/MarketContext.mqh>
#include <HashiBot/Core/RegimeEngine.mqh>
#include <HashiBot/Core/ArbitrationEngine.mqh>
#include <HashiBot/Risk/RiskEngine.mqh>
#include <HashiBot/Risk/TradeLifecycle.mqh>
#include <HashiBot/Execution/OrderManager.mqh>
#include <HashiBot/Execution/PositionTracker.mqh>

input ENUM_TIMEFRAMES contextTimeframe = PERIOD_M5;
input bool            enableDryRunSelfCheck = true;

CMarketContextBuilder g_ctxBuilder;
CRegimeEngine         g_regime;
CArbitrationEngine    g_arb;
CRiskEngine           g_risk;
COrderManager         g_order;
CPositionTracker      g_tracker;

bool RunDryRunSelfCheck()
  {
   bool ok = true;
   SymbolSpec spec; spec.Reset();
   if(spec.symbol != "" || spec.digits != 0)
      ok = false;

   ok = (g_ctxBuilder.Init() && ok);
   ok = (g_regime.Init() && ok);
   ok = (g_arb.Init() && ok);
   ok = (g_risk.Init(PROFILE_PERSONAL) && ok);
   ok = (g_order.Init(true) && ok);
   ok = (g_tracker.Init() && ok);

   Print("[SelfCheck][PersonalEA] ", (ok ? "PASS" : "FAIL"), " (dry-run only, live execution disabled)");
   return ok;
  }

int OnInit()
  {
   if(enableDryRunSelfCheck && !RunDryRunSelfCheck())
      return INIT_FAILED;

   g_ctxBuilder.Init();
   g_regime.Init();
   g_arb.Init();
   g_risk.Init(PROFILE_PERSONAL);
   g_order.Init(true);
   g_tracker.Init();
   Print("PersonalEA initialized");
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   MarketContext ctx;
   if(g_ctxBuilder.Build(_Symbol, contextTimeframe, ctx))
     {
      RegimeState regime;
      g_regime.Detect(ctx, regime);
      ArbitrationResult arb = g_arb.Evaluate(ctx, regime);
      RiskDecision risk;
      g_risk.Assess(arb, ctx, risk);
      TradeState tstate;
      string vreason = "";
      bool validPlan = g_order.ValidateTradePlan(arb.plan, ctx, vreason);
      if(risk.approved && validPlan && !g_tracker.HasActiveTradeForSymbol(ctx.symbol))
        {
         g_order.SubmitDryRun(arb.plan, risk, ctx.symbol, tstate);
         g_tracker.RegisterDryRunTrade(tstate);
        }
      else
        {
         g_order.MarkBlocked(arb.plan, risk, ctx.symbol, tstate, (risk.reason != "" ? risk.reason : vreason));
        }
      Print(g_ctxBuilder.Describe(ctx), " | ", g_regime.Describe(regime), " | ", g_arb.Describe(arb), " | ", g_risk.Describe(risk), " | valid=", vreason, " | ", g_order.DescribeLastAction(), " | ", g_tracker.Describe());
     }
   else
      Print("ctx build failed for ", _Symbol);
  }

void OnDeinit(const int reason)
  {
   Print("PersonalEA deinit reason=", reason);
  }
