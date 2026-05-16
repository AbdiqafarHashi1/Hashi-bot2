#ifndef __HASHIBOT_REPORTING_TELEMETRY_MQH__
#define __HASHIBOT_REPORTING_TELEMETRY_MQH__

#include <HashiBot/Execution/Persistence.mqh>

namespace Telemetry
  {
   bool LogCsvLine(const string fileName,const string line)
     {
      string old;
      Persistence::LoadText(fileName, old);
      string next = old + line + "\n";
      bool ok = Persistence::SaveTextAtomic(fileName, next);
      if(!ok)
         Print("[Telemetry][WARN] file write failed: ", fileName);
      return ok;
     }

   bool LogLine(const string line)
     {
      Print(line);
      return LogCsvLine("telemetry_log.csv", line);
     }
  }

#endif
