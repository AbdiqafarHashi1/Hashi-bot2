#ifndef __HASHIBOT_RISK_COMPLIANCE_MQH__
#define __HASHIBOT_RISK_COMPLIANCE_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Reporting/Reporter.mqh>

enum ComplianceSeverity
  {
   COMP_SEV_INFO = 0,
   COMP_SEV_WARNING,
   COMP_SEV_ERROR,
   COMP_SEV_CRITICAL
  };

enum ComplianceEventType
  {
   COMP_EVENT_STATE_CREATED = 0,
   COMP_EVENT_STATE_LOADED,
   COMP_EVENT_STATE_SAVED,
   COMP_EVENT_COMPLIANCE_CHECK,
   COMP_EVENT_DAILY_RESET,
   COMP_EVENT_LOCKED,
   COMP_EVENT_UNLOCKED,
   COMP_EVENT_BREACH_DETECTED,
   COMP_EVENT_SAVE_FAILED,
   COMP_EVENT_STATE_CORRUPTION,
   COMP_EVENT_UNKNOWN
  };

class CComplianceLogger
  {
private:
   CReporter m_reporter;
   string m_lastEvent;
   bool m_headerWritten;
   datetime m_lastCheckLogTime;
   double m_lastDailyLossUsed;
   double m_lastMaxLossUsed;
   bool m_lastLocked;
   int m_minLogIntervalSec;
   double m_meaningfulDelta;

public:
   bool Init(const int minLogIntervalSec=60,const double meaningfulDelta=5.0)
     {
      m_lastEvent = "";
      m_headerWritten = false;
      m_lastCheckLogTime = 0;
      m_lastDailyLossUsed = -1.0;
      m_lastMaxLossUsed = -1.0;
      m_lastLocked = false;
      m_minLogIntervalSec = minLogIntervalSec;
      m_meaningfulDelta = meaningfulDelta;
      return true;
     }

   string SeverityToString(const ComplianceSeverity sev) const
     {
      switch(sev)
        {
         case COMP_SEV_INFO: return "INFO";
         case COMP_SEV_WARNING: return "WARNING";
         case COMP_SEV_ERROR: return "ERROR";
         case COMP_SEV_CRITICAL: return "CRITICAL";
         default: return "INFO";
        }
     }

   string EventTypeToString(const ComplianceEventType e) const
     {
      switch(e)
        {
         case COMP_EVENT_STATE_CREATED: return "STATE_CREATED";
         case COMP_EVENT_STATE_LOADED: return "STATE_LOADED";
         case COMP_EVENT_STATE_SAVED: return "STATE_SAVED";
         case COMP_EVENT_COMPLIANCE_CHECK: return "COMPLIANCE_CHECK";
         case COMP_EVENT_DAILY_RESET: return "DAILY_RESET";
         case COMP_EVENT_LOCKED: return "LOCKED";
         case COMP_EVENT_UNLOCKED: return "UNLOCKED";
         case COMP_EVENT_BREACH_DETECTED: return "BREACH_DETECTED";
         case COMP_EVENT_SAVE_FAILED: return "SAVE_FAILED";
         case COMP_EVENT_STATE_CORRUPTION: return "STATE_CORRUPTION";
         default: return "UNKNOWN";
        }
     }

   string LockReasonToString(const PropLockReason reason) const
     {
      switch(reason)
        {
         case PROP_LOCK_NONE: return "NONE";
         case PROP_LOCK_DAILY_LOSS_BREACH: return "DAILY_LOSS_BREACH";
         case PROP_LOCK_MAX_LOSS_BREACH: return "MAX_LOSS_BREACH";
         case PROP_LOCK_TRAILING_DD_BREACH: return "TRAILING_DD_BREACH";
         case PROP_LOCK_MAX_TRADES_BREACH: return "MAX_TRADES_BREACH";
         case PROP_LOCK_CONSECUTIVE_LOSSES_BREACH: return "CONSECUTIVE_LOSSES_BREACH";
         case PROP_LOCK_MANUAL: return "MANUAL_LOCK";
         case PROP_LOCK_STATE_CORRUPTION: return "STATE_CORRUPTION";
         default: return "UNKNOWN";
        }
     }

   bool ShouldLogCheck(const bool locked,const double dailyLossUsed,const double maxLossUsed)
     {
      bool lockChanged = (locked != m_lastLocked);
      bool dailyChanged = (m_lastDailyLossUsed < 0.0 || MathAbs(dailyLossUsed - m_lastDailyLossUsed) >= m_meaningfulDelta);
      bool maxChanged = (m_lastMaxLossUsed < 0.0 || MathAbs(maxLossUsed - m_lastMaxLossUsed) >= m_meaningfulDelta);
      bool intervalPassed = (m_lastCheckLogTime == 0 || (TimeCurrent() - m_lastCheckLogTime) >= m_minLogIntervalSec);
      return (lockChanged || dailyChanged || maxChanged || intervalPassed);
     }

   bool LogComplianceEvent(const ComplianceSeverity severity,const ComplianceEventType eventType,
                           const string profile,const PropLockReason reason,
                           const double balance,const double equity,const double dayStartEquity,
                           const double highWaterBalance,const double dailyLossUsed,const double maxLossUsed,
                           const int tradesToday,const int consecutiveLosses,
                           const bool locked,const string message)
     {
      string csv = StringFormat("%s,%s,%s,%s,%s,%s,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%d,%d,%s",
                                TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS),
                                SeverityToString(severity),
                                EventTypeToString(eventType),
                                profile,
                                LockReasonToString(reason),
                                (locked?"true":"false"),
                                balance,equity,dayStartEquity,highWaterBalance,dailyLossUsed,maxLossUsed,
                                tradesToday,consecutiveLosses,
                                message);

      if(!m_headerWritten)
        {
         string hdr = "timestamp,severity,event_type,profile,lock_reason,locked,balance,equity,day_start_equity,high_water_balance,daily_loss_used,max_loss_used,trades_today,consecutive_losses,message";
         m_reporter.ReportCsv("compliance_events.csv", hdr);
         m_headerWritten = true;
        }

      m_reporter.ReportCsv("compliance_events.csv", csv);
      m_reporter.Report("COMPLIANCE", csv);
      m_lastEvent = csv;

      if(eventType == COMP_EVENT_COMPLIANCE_CHECK)
        {
         m_lastCheckLogTime = TimeCurrent();
         m_lastDailyLossUsed = dailyLossUsed;
         m_lastMaxLossUsed = maxLossUsed;
         m_lastLocked = locked;
        }
      return true;
     }

   string DescribeLastEvent() const { return m_lastEvent; }
  };

#endif
