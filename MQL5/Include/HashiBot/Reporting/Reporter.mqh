#ifndef __HASHIBOT_REPORTING_REPORTER_MQH__
#define __HASHIBOT_REPORTING_REPORTER_MQH__

#include <HashiBot/Reporting/Telemetry.mqh>

class CReporter
  {
public:
   bool Report(const string channel,const string payload)
     {
      return Telemetry::LogLine("[" + channel + "] " + payload);
     }

   bool ReportCsv(const string fileName,const string csvLine)
     {
      return Telemetry::LogCsvLine(fileName, csvLine);
     }
  };

#endif
