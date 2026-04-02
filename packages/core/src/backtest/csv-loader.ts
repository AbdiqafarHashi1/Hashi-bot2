import fs from "node:fs";
import readline from "node:readline";
import type { Candle, MarketDataSource } from "../domains";

export type CsvDatasetLoadOptions = {
  filePath: string;
  source?: MarketDataSource;
  maxRows?: number;
};

const parseRow = (row: string, lineNo: number) => {
  const parts = row.split(",").map((p) => p.trim());
  if (parts.length !== 6) {
    throw new Error(`Invalid CSV format at line ${lineNo}: expected 6 columns`);
  }

  const [timestamp, open, high, low, close, volume] = parts.map(Number);
  if ([timestamp, open, high, low, close, volume].some(Number.isNaN)) {
    throw new Error(`Invalid numeric value at line ${lineNo}`);
  }

  return { timestamp, open, high, low, close, volume };
};

export async function loadCandlesFromCsv(options: CsvDatasetLoadOptions): Promise<Candle[]> {
  const { filePath, source = "binance_spot", maxRows } = options;
  const candles: Candle[] = [];
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const lineReader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lineNo = 0;
  for await (const rawLine of lineReader) {
    lineNo += 1;
    const line = rawLine.trim();
    if (!line) continue;
    if (lineNo === 1 && line.toLowerCase().includes("timestamp")) continue;

    const parsed = parseRow(line, lineNo);
    candles.push({
      openTime: parsed.timestamp,
      closeTime: parsed.timestamp,
      open: parsed.open,
      high: parsed.high,
      low: parsed.low,
      close: parsed.close,
      volume: parsed.volume,
      source
    });

    if (maxRows && candles.length >= maxRows) break;
  }

  if (candles.length < 50) {
    throw new Error(`Dataset too small: ${candles.length} rows loaded from ${filePath}`);
  }

  return candles.sort((a, b) => a.openTime - b.openTime);
}
