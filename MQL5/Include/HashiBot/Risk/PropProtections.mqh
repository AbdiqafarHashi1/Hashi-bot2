//+------------------------------------------------------------------+
//| PropProtections.mqh                                              |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_RISK_PROPPROTECTIONS_MQH__
#define __HASHIBOT_RISK_PROPPROTECTIONS_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Utils/TimeHelpers.mqh>
#include <HashiBot/Execution/Persistence.mqh>
#include <HashiBot/Risk/Compliance.mqh>

enum PropProfileType
  {
   PROP_FTMO_2_STEP = 0,
   PROP_FTMO_1_STEP,
   PROP_CUSTOM
  };

class CPropProtections
  {
private:
   bool            m_initialized;
   PropProfileType m_profile;
   double          m_dailyLossPct;
   double          m_maxLossPct;
   int             m_maxTradesPerDay;
   int             m_maxConsecutiveLosses;
   int             m_resetHourCest;
   int             m_resetOffsetHours;
   PropLockReason  m_lockReasonType;
   CComplianceLogger m_logger;

   string StateFile() const { return "prop_state_v1.kv"; }
   string ProfileName() const { return (m_profile==PROP_FTMO_1_STEP?"FTMO_1_STEP":(m_profile==PROP_CUSTOM?"CUSTOM":"FTMO_2_STEP")); }
   datetime LastResetBoundaryCest(datetime nowServer) const
     {
      datetime next = TimeHelpers::PropResetTimePlaceholder(nowServer, m_resetOffsetHours, m_resetHourCest);
      return next - 86400;
     }

public:
   double          initialCapital;
   double          dayStartBalance;
   double          dayStartEquity;
   double          currentBalance;
   double          currentEquity;
   double          highWaterBalance;
   double          dailyLossLimitMoney;
   double          maxLossLimitMoney;
   double          dailyLossUsed;
   double          maxLossUsed;
   bool            isLocked;
   string          lockReason;
   datetime        lockedTime;
   int             tradesToday;
   int             consecutiveLosses;
   datetime        lastUpdateTime;
   datetime        lastResetTimestamp;

public:
                  CPropProtections(void)
     {
      Reset();
     }

   bool Init()
     {
      Reset();
      SetProfile(PROP_FTMO_2_STEP);
      m_logger.Init(60, 5.0);

      currentBalance = AccountInfoDouble(ACCOUNT_BALANCE);
      currentEquity = AccountInfoDouble(ACCOUNT_EQUITY);

      if(!LoadState())
        {
         initialCapital = currentBalance;
         if(initialCapital <= 0.0)
            initialCapital = 100000.0;
         dayStartBalance = currentBalance;
         dayStartEquity = currentEquity;
         highWaterBalance = MathMax(initialCapital, currentBalance);
         lastResetTimestamp = LastResetBoundaryCest(TimeCurrent());
         UpdateLimits();
         SaveState();
         m_logger.LogComplianceEvent(COMP_SEV_INFO, COMP_EVENT_DAILY_RESET, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, isLocked, "daily_reset");
         m_logger.LogComplianceEvent(COMP_SEV_INFO, COMP_EVENT_STATE_CREATED, ProfileName(), PROP_LOCK_NONE, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, isLocked, "state_created");
        }
      else
        {
         // preserve loaded lock state; only daily reset may unlock
         UpdateLimits();
         UnlockForNewDayIfAllowed();
         m_logger.LogComplianceEvent(COMP_SEV_INFO, COMP_EVENT_STATE_LOADED, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, isLocked, "state_loaded");
        }

      m_initialized = true;
      return true;
     }

   void Reset()
     {
      m_initialized = false;
      m_profile = PROP_FTMO_2_STEP;
      m_dailyLossPct = 5.0;
      m_maxLossPct = 10.0;
      m_maxTradesPerDay = 5;
      m_maxConsecutiveLosses = 3;
      m_resetHourCest = 0;
      m_resetOffsetHours = 2;
      m_lockReasonType = PROP_LOCK_NONE;

      initialCapital = 0.0;
      dayStartBalance = 0.0;
      dayStartEquity = 0.0;
      currentBalance = 0.0;
      currentEquity = 0.0;
      highWaterBalance = 0.0;
      dailyLossLimitMoney = 0.0;
      maxLossLimitMoney = 0.0;
      dailyLossUsed = 0.0;
      maxLossUsed = 0.0;
      isLocked = false;
      lockReason = "";
      lockedTime = 0;
      tradesToday = 0;
      consecutiveLosses = 0;
      lastUpdateTime = 0;
      lastResetTimestamp = 0;
     }

   void SetProfile(PropProfileType profile,const double customDailyLossPct=5.0,const double customMaxLossPct=10.0)
     {
      m_profile = profile;
      if(profile == PROP_FTMO_1_STEP)
        {
         m_dailyLossPct = 3.0;
         m_maxLossPct = 10.0;
        }
      else if(profile == PROP_CUSTOM)
        {
         m_dailyLossPct = customDailyLossPct;
         m_maxLossPct = customMaxLossPct;
        }
      else
        {
         m_dailyLossPct = 5.0;
         m_maxLossPct = 10.0;
        }
      UpdateLimits();
     }

   void UpdateLimits()
     {
      double baseForMaxLoss = initialCapital;
      if(m_profile == PROP_FTMO_1_STEP)
         baseForMaxLoss = MathMax(initialCapital, highWaterBalance);

      dailyLossLimitMoney = initialCapital * (m_dailyLossPct / 100.0);
      maxLossLimitMoney = baseForMaxLoss * (m_maxLossPct / 100.0);
     }

   bool LoadState()
     {
      string raw;
      if(!Persistence::LoadText(StateFile(), raw))
         return false;

      string v;
      if(Persistence::TryGetValue(raw, "profile", v)) m_profile = (PropProfileType)StringToInteger(v);
      if(Persistence::TryGetValue(raw, "initialCapital", v)) initialCapital = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "dayStartBalance", v)) dayStartBalance = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "dayStartEquity", v)) dayStartEquity = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "currentBalance", v)) currentBalance = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "currentEquity", v)) currentEquity = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "highWaterBalance", v)) highWaterBalance = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "dailyLossLimitMoney", v)) dailyLossLimitMoney = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "maxLossLimitMoney", v)) maxLossLimitMoney = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "dailyLossUsed", v)) dailyLossUsed = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "maxLossUsed", v)) maxLossUsed = StringToDouble(v);
      if(Persistence::TryGetValue(raw, "isLocked", v)) isLocked = (StringToInteger(v) != 0);
      if(Persistence::TryGetValue(raw, "lockReason", v)) lockReason = v;
      if(Persistence::TryGetValue(raw, "lockReasonType", v)) m_lockReasonType = (PropLockReason)StringToInteger(v);
      if(Persistence::TryGetValue(raw, "lockedTime", v)) lockedTime = (datetime)StringToInteger(v);
      if(Persistence::TryGetValue(raw, "tradesToday", v)) tradesToday = (int)StringToInteger(v);
      if(Persistence::TryGetValue(raw, "consecutiveLosses", v)) consecutiveLosses = (int)StringToInteger(v);
      if(Persistence::TryGetValue(raw, "lastUpdateTime", v)) lastUpdateTime = (datetime)StringToInteger(v);
      if(Persistence::TryGetValue(raw, "lastResetTimestamp", v)) lastResetTimestamp = (datetime)StringToInteger(v);

      if(initialCapital <= 0.0)
         initialCapital = AccountInfoDouble(ACCOUNT_BALANCE);

      return true;
     }

   bool SaveState()
     {
      string s = "";
      s += "profile=" + IntegerToString((int)m_profile) + "\n";
      s += "initialCapital=" + DoubleToString(initialCapital, 2) + "\n";
      s += "dayStartBalance=" + DoubleToString(dayStartBalance, 2) + "\n";
      s += "dayStartEquity=" + DoubleToString(dayStartEquity, 2) + "\n";
      s += "currentBalance=" + DoubleToString(currentBalance, 2) + "\n";
      s += "currentEquity=" + DoubleToString(currentEquity, 2) + "\n";
      s += "highWaterBalance=" + DoubleToString(highWaterBalance, 2) + "\n";
      s += "dailyLossLimitMoney=" + DoubleToString(dailyLossLimitMoney, 2) + "\n";
      s += "maxLossLimitMoney=" + DoubleToString(maxLossLimitMoney, 2) + "\n";
      s += "dailyLossUsed=" + DoubleToString(dailyLossUsed, 2) + "\n";
      s += "maxLossUsed=" + DoubleToString(maxLossUsed, 2) + "\n";
      s += "isLocked=" + IntegerToString(isLocked ? 1 : 0) + "\n";
      s += "lockReason=" + lockReason + "\n";
      s += "lockReasonType=" + IntegerToString((int)m_lockReasonType) + "\n";
      s += "lockedTime=" + IntegerToString((int)lockedTime) + "\n";
      s += "tradesToday=" + IntegerToString(tradesToday) + "\n";
      s += "consecutiveLosses=" + IntegerToString(consecutiveLosses) + "\n";
      s += "lastUpdateTime=" + IntegerToString((int)lastUpdateTime) + "\n";
      s += "lastResetTimestamp=" + IntegerToString((int)lastResetTimestamp) + "\n";
      bool ok = Persistence::SaveTextAtomic(StateFile(), s);
      if(ok)
         m_logger.LogComplianceEvent(COMP_SEV_INFO, COMP_EVENT_STATE_SAVED, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, isLocked, "state_saved");
      else
         m_logger.LogComplianceEvent(COMP_SEV_ERROR, COMP_EVENT_SAVE_FAILED, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, isLocked, "save_failed");
      return ok;
     }

   bool UpdateAccountState()
     {
      if(!m_initialized)
         Init();

      currentBalance = AccountInfoDouble(ACCOUNT_BALANCE);
      currentEquity = AccountInfoDouble(ACCOUNT_EQUITY);
      lastUpdateTime = TimeCurrent();

      if(currentBalance > highWaterBalance)
         highWaterBalance = currentBalance;

      UnlockForNewDayIfAllowed();
      UpdateLimits();

      dailyLossUsed = MathMax(0.0, dayStartEquity - currentEquity);
      double maxLossReference = (m_profile == PROP_FTMO_1_STEP) ? MathMax(initialCapital, highWaterBalance) : initialCapital;
      maxLossUsed = MathMax(0.0, maxLossReference - currentEquity);

      SaveState();
      if(m_logger.ShouldLogCheck(isLocked, dailyLossUsed, maxLossUsed))
         m_logger.LogComplianceEvent(COMP_SEV_INFO, COMP_EVENT_COMPLIANCE_CHECK, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, isLocked, "compliance_check");
      return true;
     }

   bool CheckCompliance()
     {
      UpdateAccountState();

      if(isLocked)
         return false;
      if(dailyLossUsed >= dailyLossLimitMoney)
        {
         Lock("daily_loss_limit_breached", PROP_LOCK_DAILY_LOSS_BREACH);
         return false;
        }
      if(maxLossUsed >= maxLossLimitMoney)
        {
         Lock("max_loss_limit_breached", PROP_LOCK_MAX_LOSS_BREACH);
         return false;
        }
      if(tradesToday >= m_maxTradesPerDay)
        {
         Lock("max_trades_per_day_breached", PROP_LOCK_MAX_TRADES_BREACH);
         return false;
        }
      if(consecutiveLosses >= m_maxConsecutiveLosses)
        {
         Lock("max_consecutive_losses_breached", PROP_LOCK_CONSECUTIVE_LOSSES_BREACH);
         return false;
        }

      SaveState();
      if(m_logger.ShouldLogCheck(isLocked, dailyLossUsed, maxLossUsed))
         m_logger.LogComplianceEvent(COMP_SEV_INFO, COMP_EVENT_COMPLIANCE_CHECK, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, isLocked, "compliance_check");
      return true;
     }

   bool CanOpenNewTrade(RiskDecision &decision)
     {
      if(!CheckCompliance())
        {
         decision.approved = false;
         decision.decision = RISK_DECISION_LOCKED;
         decision.reason = lockReason;
         decision.violation = SUPPRESS_PROP_LOCK;
         decision.suppression.isSuppressed = true;
         decision.suppression.reasonCount = 1;
         decision.suppression.reasons[0] = SUPPRESS_PROP_LOCK;
         return false;
        }
      return true;
     }

   void Lock(string reason,PropLockReason reasonType=PROP_LOCK_UNKNOWN)
     {
      isLocked = true;
      lockReason = reason;
      m_lockReasonType = reasonType;
      lockedTime = TimeCurrent();
      SaveState();
      m_logger.LogComplianceEvent(COMP_SEV_CRITICAL, COMP_EVENT_LOCKED, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, true, reason);
      m_logger.LogComplianceEvent(COMP_SEV_CRITICAL, COMP_EVENT_BREACH_DETECTED, ProfileName(), m_lockReasonType, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, true, "breach_detected");
     }

   void UnlockForNewDayIfAllowed()
     {
      datetime now = TimeCurrent();
      datetime boundary = LastResetBoundaryCest(now);
      if(lastResetTimestamp == 0)
         lastResetTimestamp = boundary;

      if(boundary > lastResetTimestamp)
        {
         // FTMO_1_STEP EOD trailing reference update
         if(m_profile == PROP_FTMO_1_STEP)
            highWaterBalance = MathMax(highWaterBalance, currentBalance);

         dayStartBalance = currentBalance;
         dayStartEquity = currentEquity;
         tradesToday = 0;
         consecutiveLosses = 0;
         lastResetTimestamp = boundary;

         // Never unlock max-loss breaches automatically
         if(isLocked && lockReason != "max_loss_limit_breached")
           {
            isLocked = false;
            lockReason = "";
            m_lockReasonType = PROP_LOCK_NONE;
            lockedTime = 0;
            m_logger.LogComplianceEvent(COMP_SEV_WARNING, COMP_EVENT_UNLOCKED, ProfileName(), PROP_LOCK_NONE, currentBalance, currentEquity, dayStartEquity, highWaterBalance, dailyLossUsed, maxLossUsed, tradesToday, consecutiveLosses, false, "new_day_unlock");
           }
         SaveState();
        }
     }

   string DescribeLastComplianceEvent() { return m_logger.DescribeLastEvent(); }

   string Describe()
     {
      return StringFormat("prop eq=%.2f day_limit=%.2f day_used=%.2f max_limit=%.2f max_used=%.2f locked=%s reason=%s reason_enum=%d last=%s",
                          currentEquity,
                          dailyLossLimitMoney,
                          dailyLossUsed,
                          maxLossLimitMoney,
                          maxLossUsed,
                          (isLocked ? "true" : "false"),
                          lockReason,
                          (int)m_lockReasonType,
                          m_logger.DescribeLastEvent());
     }
  };

#endif
