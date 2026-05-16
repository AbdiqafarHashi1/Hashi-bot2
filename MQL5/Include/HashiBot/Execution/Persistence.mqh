//+------------------------------------------------------------------+
//| Persistence.mqh                                                  |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_EXECUTION_PERSISTENCE_MQH__
#define __HASHIBOT_EXECUTION_PERSISTENCE_MQH__

namespace Persistence
  {
   string BaseDir()
     {
      return "HashiBot/";
     }

   string BuildPath(const string fileName)
     {
      return BaseDir() + fileName;
     }

   bool EnsureDir()
     {
      return FolderCreate(BaseDir());
     }

   bool SaveTextAtomic(const string fileName,const string content)
     {
      EnsureDir();
      string finalPath = BuildPath(fileName);
      string tmpPath = BuildPath(fileName + ".tmp");

      int h = FileOpen(tmpPath, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
      if(h == INVALID_HANDLE)
         return false;
      FileWriteString(h, content);
      FileFlush(h);
      FileClose(h);

      FileDelete(finalPath, FILE_COMMON);
      if(!FileMove(tmpPath, 0, finalPath, FILE_COMMON))
        {
         // fallback: copy tmp content into final directly
         int r = FileOpen(tmpPath, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
         int w = FileOpen(finalPath, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
         if(r == INVALID_HANDLE || w == INVALID_HANDLE)
           {
            if(r != INVALID_HANDLE) FileClose(r);
            if(w != INVALID_HANDLE) FileClose(w);
            return false;
           }
         string s = FileReadString(r);
         FileWriteString(w, s);
         FileClose(r);
         FileFlush(w);
         FileClose(w);
         FileDelete(tmpPath, FILE_COMMON);
        }
      return true;
     }

   bool LoadText(const string fileName,string &content)
     {
      content = "";
      string path = BuildPath(fileName);
      int h = FileOpen(path, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON);
      if(h == INVALID_HANDLE)
         return false;
      while(!FileIsEnding(h))
         content += FileReadString(h);
      FileClose(h);
      return true;
     }


   string TrimString(const string value)
     {
      int len = StringLen(value);
      int start = 0;
      while(start < len)
        {
         int c = StringGetCharacter(value, start);
         if(c != 32 && c != 9 && c != 13 && c != 10)
            break;
         start++;
        }

      int end = len - 1;
      while(end >= start)
        {
         int c = StringGetCharacter(value, end);
         if(c != 32 && c != 9 && c != 13 && c != 10)
            break;
         end--;
        }

      if(end < start)
         return "";
      return StringSubstr(value, start, end - start + 1);
     }

   bool TryGetValue(const string text,const string key,string &out)
     {
      string lines[];
      int n = StringSplit(text, '\n', lines);
      string prefix = key + "=";
      for(int i = 0; i < n; i++)
        {
         string line = TrimString(lines[i]);
         if(StringFind(line, prefix) == 0)
           {
            out = StringSubstr(line, StringLen(prefix));
            return true;
           }
        }
      return false;
     }
  }

#endif
