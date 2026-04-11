import pandas as pd
from pathlib import Path

CSV_5M = Path("data/ETHUSDT_5m.csv")
CSV_15M = Path("data/ETHUSDT_15m.csv")

CHUNK_SIZE = 200_000

def read_15m_timestamps(path: Path):
    df = pd.read_csv(path, usecols=["open_time"])
    if pd.api.types.is_numeric_dtype(df["open_time"]):
        ts = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    else:
        ts = pd.to_datetime(df["open_time"], utc=True)
    return ts

def stream_5m_stats(path: Path):
    total_rows = 0
    gap_anomalies = 0
    first_ts = None
    last_ts = None
    prev_ms = None
    expected_gap = 5 * 60 * 1000

    for chunk in pd.read_csv(path, usecols=["open_time"], chunksize=CHUNK_SIZE):
        col = chunk["open_time"]

        if pd.api.types.is_numeric_dtype(col):
            ts = pd.to_datetime(col, unit="ms", utc=True)
            ms = col.astype("int64")
        else:
            ts = pd.to_datetime(col, utc=True)
            ms = (ts.astype("int64") // 10**6).astype("int64")

        if len(ts) == 0:
            continue

        if first_ts is None:
            first_ts = ts.iloc[0]

        last_ts = ts.iloc[-1]
        total_rows += len(ts)

        values = ms.tolist()
        if prev_ms is not None:
            if values[0] - prev_ms != expected_gap:
                gap_anomalies += 1

        for i in range(1, len(values)):
            if values[i] - values[i - 1] != expected_gap:
                gap_anomalies += 1

        prev_ms = values[-1]

    return {
        "rows": total_rows,
        "gap_anomalies": gap_anomalies,
        "first_ts": first_ts,
        "last_ts": last_ts,
    }

def stream_missing_15m_from_5m(path_5m: Path, ts_15m):
    needed_ms = set((ts_15m.astype("int64") // 10**6).astype("int64").tolist())
    found_ms = set()

    for chunk in pd.read_csv(path_5m, usecols=["open_time"], chunksize=CHUNK_SIZE):
        col = chunk["open_time"]
        if pd.api.types.is_numeric_dtype(col):
            ms = set(col.astype("int64").tolist())
        else:
            ts = pd.to_datetime(col, utc=True)
            ms = set((ts.astype("int64") // 10**6).astype("int64").tolist())

        hits = needed_ms.intersection(ms)
        if hits:
            found_ms.update(hits)

        if len(found_ms) == len(needed_ms):
            break

    return len(needed_ms - found_ms)

def main():
    if not CSV_5M.exists():
        print(f"Missing: {CSV_5M}")
        return
    if not CSV_15M.exists():
        print(f"Missing: {CSV_15M}")
        return

    ts_15m = read_15m_timestamps(CSV_15M)
    stats_5m = stream_5m_stats(CSV_5M)

    start_15 = ts_15m.iloc[0]
    end_15 = ts_15m.iloc[-1]
    start_5 = stats_5m["first_ts"]
    end_5 = stats_5m["last_ts"]

    print(f"15m rows: {len(ts_15m)}")
    print(f"5m rows: {stats_5m['rows']}")
    print(f"15m start: {start_15}")
    print(f"5m start : {start_5}")
    print(f"15m end  : {end_15}")
    print(f"5m end   : {end_5}")

    if start_5 > start_15:
        print("WARNING: 5m starts later than 15m")
    if end_5 < end_15:
        print("WARNING: 5m ends earlier than 15m")

    print(f"Gap anomalies: {stats_5m['gap_anomalies']}")

    missing_15m = stream_missing_15m_from_5m(CSV_5M, ts_15m)
    print(f"15m timestamps missing from 5m dataset: {missing_15m}")

    expected_ratio = stats_5m["rows"] / len(ts_15m) if len(ts_15m) else 0
    print(f"5m-to-15m row ratio: {expected_ratio:.4f}")

if __name__ == "__main__":
    main()