import csv
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
import requests


BASE_URL = "https://api.binance.com/api/v3/klines"
SYMBOL = "ETHUSDT"
INTERVAL = "5m"
LIMIT = 1000

INPUT_15M = Path("data/ETHUSDT_15m.csv")
OUTPUT_5M = Path("data/ETHUSDT_5m.csv")


def detect_timestamp_column(df: pd.DataFrame) -> str:
    candidates = ["timestamp", "open_time", "time", "datetime", "date"]
    for c in candidates:
        if c in df.columns:
            return c
    raise ValueError(
        f"Could not find timestamp column in 15m dataset. Columns: {list(df.columns)}"
    )


def parse_timestamp_series_to_ms(series: pd.Series) -> pd.Series:
    # If already numeric-like, assume ms or seconds.
    numeric = pd.to_numeric(series, errors="coerce")

    if numeric.notna().all():
        # Heuristic:
        # ms timestamps are usually > 1e12
        # sec timestamps are usually around 1e9
        median_val = numeric.median()
        if median_val > 1e12:
            return numeric.astype("int64")
        elif median_val > 1e9:
            return (numeric * 1000).astype("int64")

    # Otherwise parse as datetime string
    dt = pd.to_datetime(series, utc=True, errors="raise")
    return (dt.astype("int64") // 10**6).astype("int64")


def get_15m_range_ms(csv_path: Path) -> tuple[int, int]:
    if not csv_path.exists():
        raise FileNotFoundError(f"15m dataset not found: {csv_path}")

    df = pd.read_csv(csv_path)
    ts_col = detect_timestamp_column(df)
    ts_ms = parse_timestamp_series_to_ms(df[ts_col])

    start_ms = int(ts_ms.min())
    end_ms = int(ts_ms.max())

    return start_ms, end_ms


def fetch_klines(
    symbol: str,
    interval: str,
    start_time_ms: int,
    end_time_ms: int,
    limit: int = 1000,
) -> list[list]:
    params = {
        "symbol": symbol,
        "interval": interval,
        "startTime": start_time_ms,
        "endTime": end_time_ms,
        "limit": limit,
    }
    resp = requests.get(BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def ensure_header(csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    if csv_path.exists() and csv_path.stat().st_size > 0:
        return

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "open_time",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "close_time",
            "quote_asset_volume",
            "number_of_trades",
            "taker_buy_base_asset_volume",
            "taker_buy_quote_asset_volume",
        ])


def last_open_time_from_csv(csv_path: Path) -> Optional[int]:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return None

    last_row = None
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            last_row = row

    if not last_row:
        return None
    return int(last_row["open_time"])


def append_rows(csv_path: Path, rows: list[list]) -> None:
    with csv_path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for row in rows:
            # Binance returns 12 fields; last field is ignore
            writer.writerow(row[:11])


def ms_to_utc_str(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def main() -> None:
    start_ms, end_ms = get_15m_range_ms(INPUT_15M)

    ensure_header(OUTPUT_5M)

    existing_last = last_open_time_from_csv(OUTPUT_5M)
    if existing_last is not None:
        # Resume from next 5m candle if partially downloaded already
        start_ms = max(start_ms, existing_last + 5 * 60 * 1000)

    print(f"15m-aligned range:")
    print(f"  start: {ms_to_utc_str(start_ms)}")
    print(f"  end:   {ms_to_utc_str(end_ms)}")
    print(f"Output: {OUTPUT_5M.resolve()}")

    total_rows = 0
    request_count = 0

    while start_ms <= end_ms:
        try:
            rows = fetch_klines(SYMBOL, INTERVAL, start_ms, end_ms, LIMIT)
        except requests.HTTPError as e:
            print(f"HTTP error: {e}. Sleeping 10s...")
            time.sleep(10)
            continue
        except requests.RequestException as e:
            print(f"Network error: {e}. Sleeping 10s...")
            time.sleep(10)
            continue

        request_count += 1

        if not rows:
            print("No more rows returned. Finished.")
            break

        append_rows(OUTPUT_5M, rows)
        total_rows += len(rows)

        first_ms = rows[0][0]
        last_ms = rows[-1][0]
        print(
            f"[{request_count}] wrote {len(rows)} rows "
            f"{ms_to_utc_str(first_ms)} -> {ms_to_utc_str(last_ms)}"
        )

        next_start = last_ms + 5 * 60 * 1000
        if next_start <= start_ms:
            raise RuntimeError("Pagination did not advance; stopping to avoid loop.")

        start_ms = next_start
        time.sleep(0.25)

    print(f"Done. Rows appended this run: {total_rows}")


if __name__ == "__main__":
    main()