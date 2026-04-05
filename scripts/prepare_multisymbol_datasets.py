#!/usr/bin/env python3
import csv
import json
import shutil
import subprocess
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib.request import urlopen

REFERENCE_PATH = Path("data/ETHUSDT_15m.csv")
OUTPUT_DIR = Path("data")
TMP_DIR = Path("runtime/data_prep_tmp")

CRYPTO_SOURCES = {
    "BTCUSDT": [
        "https://raw.githubusercontent.com/linner888-maker/Binance_BTCUSDT_2025/main/Binance_BTCUSDT_2025_minute001.csv",
        "https://raw.githubusercontent.com/linner888-maker/Binance_BTCUSDT_2025/main/Binance_BTCUSDT_2025_minute002.csv",
    ],
    "SOLUSDT": [
        "https://raw.githubusercontent.com/linner888-maker/Binance_SOLUSDT_2025/main/Binance_SOLUSDT_2025_minute001.csv",
        "https://raw.githubusercontent.com/linner888-maker/Binance_SOLUSDT_2025/main/Binance_SOLUSDT_2025_minute002.csv",
    ],
}

FOREX_REPO_SOURCES = {
    "EURUSD": ("https://github.com/FX-Data/FX-Data-EURUSD-DS.git", "EURUSD-2022", "EURUSD"),
    "GBPUSD": ("https://github.com/FX-Data/FX-Data-GBPUSD-DS.git", "GBPUSD-2022", "GBPUSD"),
}


@dataclass
class Summary:
    symbol: str
    source: str
    output_path: str
    row_count: int
    start_ts: int | None
    end_ts: int | None


def read_reference_schema() -> List[str]:
    with REFERENCE_PATH.open() as f:
        reader = csv.reader(f)
        header = next(reader)
    expected = ["timestamp", "open", "high", "low", "close", "volume"]
    if header != expected:
        raise RuntimeError(f"Reference schema mismatch. expected={expected}, got={header}")
    return header


def parse_crypto_csv(url: str) -> Iterable[Tuple[int, float, float, float, float, float]]:
    with urlopen(url, timeout=120) as resp:
        decoded = resp.read().decode("utf-8", errors="ignore").splitlines()
    for line in decoded:
        if not line or line.startswith("https://") or line.startswith("Unix,"):
            continue
        parts = line.split(",")
        if len(parts) < 8:
            continue
        ts = int(parts[0])
        o = float(parts[3])
        h = float(parts[4])
        l = float(parts[5])
        c = float(parts[6])
        v = float(parts[7])
        yield ts, o, h, l, c, v


def parse_forex_ticks(repo_url: str, branch: str, symbol_dir: str, workdir: Path) -> Iterable[Tuple[int, float, float, float, float, float]]:
    clone_dir = workdir / f"{symbol_dir.lower()}_{branch.lower()}"
    if clone_dir.exists():
        shutil.rmtree(clone_dir)
    subprocess.run([
        "git",
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        repo_url,
        str(clone_dir),
    ], check=True)

    for tick_file in sorted((clone_dir / symbol_dir).rglob("*_ticks.csv")):
        with tick_file.open() as f:
            for line in f:
                raw = line.strip()
                if not raw:
                    continue
                # 2022.01.27 11:00:00.106,1.11874,1.11877,0.12,0.90
                ts_s, bid_s, ask_s, bid_vol_s, ask_vol_s = raw.split(",")
                dt = datetime.strptime(ts_s, "%Y.%m.%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
                ts = int(dt.timestamp() * 1000)
                bid = float(bid_s)
                ask = float(ask_s)
                mid = (bid + ask) / 2
                vol = float(bid_vol_s) + float(ask_vol_s)
                yield ts, mid, mid, mid, mid, vol

    shutil.rmtree(clone_dir)


def aggregate_to_15m(rows: Iterable[Tuple[int, float, float, float, float, float]]) -> List[Dict[str, str]]:
    bucket_data: Dict[int, List[Tuple[int, float, float, float, float, float]]] = defaultdict(list)
    bucket_ms = 15 * 60 * 1000
    for row in rows:
        ts = row[0]
        bucket = ts - (ts % bucket_ms)
        bucket_data[bucket].append(row)

    out: List[Dict[str, str]] = []
    for bucket in sorted(bucket_data.keys()):
        items = sorted(bucket_data[bucket], key=lambda x: x[0])
        open_price = items[0][1]
        high_price = max(i[2] for i in items)
        low_price = min(i[3] for i in items)
        close_price = items[-1][4]
        volume = sum(i[5] for i in items)
        out.append(
            {
                "timestamp": str(bucket),
                "open": f"{open_price}",
                "high": f"{high_price}",
                "low": f"{low_price}",
                "close": f"{close_price}",
                "volume": f"{volume}",
            }
        )
    return out


def write_csv(path: Path, rows: List[Dict[str, str]], header: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)


def make_summary(symbol: str, source: str, path: Path, rows: List[Dict[str, str]]) -> Summary:
    start_ts = int(rows[0]["timestamp"]) if rows else None
    end_ts = int(rows[-1]["timestamp"]) if rows else None
    return Summary(
        symbol=symbol,
        source=source,
        output_path=str(path),
        row_count=len(rows),
        start_ts=start_ts,
        end_ts=end_ts,
    )


def iso(ts: int | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat()


def main() -> None:
    header = read_reference_schema()
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    summaries: List[Summary] = []

    for symbol, urls in CRYPTO_SOURCES.items():
        raw_rows: List[Tuple[int, float, float, float, float, float]] = []
        for url in urls:
            raw_rows.extend(parse_crypto_csv(url))
        rows = aggregate_to_15m(raw_rows)
        out_path = OUTPUT_DIR / f"{symbol}_15m.csv"
        write_csv(out_path, rows, header)
        summaries.append(make_summary(symbol, " + ".join(urls), out_path, rows))

    for symbol, (repo, branch, symbol_dir) in FOREX_REPO_SOURCES.items():
        rows = aggregate_to_15m(parse_forex_ticks(repo, branch, symbol_dir, TMP_DIR))
        out_path = OUTPUT_DIR / f"{symbol}_15m.csv"
        write_csv(out_path, rows, header)
        summaries.append(make_summary(symbol, f"{repo}@{branch}", out_path, rows))

    manifest = {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
        "referenceSchemaPath": str(REFERENCE_PATH),
        "schema": header,
        "datasets": [
            {
                **s.__dict__,
                "startIso": iso(s.start_ts),
                "endIso": iso(s.end_ts),
            }
            for s in summaries
        ],
    }
    manifest_path = Path("data/validation/multi_symbol_dataset_manifest.json")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
