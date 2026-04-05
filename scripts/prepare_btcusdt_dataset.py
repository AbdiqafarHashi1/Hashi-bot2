#!/usr/bin/env python3
"""Download and normalize BTCUSDT 15m OHLCV to match data/ETHUSDT_15m.csv."""

from __future__ import annotations

import csv
import json
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

REFERENCE_PATH = Path("data/ETHUSDT_15m.csv")
OUTPUT_PATH = Path("data/BTCUSDT_15m.csv")
RAW_DIR = Path("data/raw/linner888-maker/BTCUSDT")
MANIFEST_PATH = Path("data/validation/btcusdt_15m_manifest.json")

EXPECTED_SCHEMA = ["timestamp", "open", "high", "low", "close", "volume"]

SOURCE_URLS = [
    "https://raw.githubusercontent.com/linner888-maker/Binance_BTCUSDT_2025/main/Binance_BTCUSDT_2025_minute001.csv",
    "https://raw.githubusercontent.com/linner888-maker/Binance_BTCUSDT_2025/main/Binance_BTCUSDT_2025_minute002.csv",
]


@dataclass
class DownloadAttempt:
    url: str
    raw_path: str
    status: str
    error: str | None = None


def read_reference_schema() -> tuple[list[str], int, int, int]:
    with REFERENCE_PATH.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    if header != EXPECTED_SCHEMA:
        raise RuntimeError(f"Reference schema mismatch: expected {EXPECTED_SCHEMA}, got {header}")
    if not rows:
        raise RuntimeError("Reference dataset is empty")

    return header, len(rows), int(rows[0][0]), int(rows[-1][0])


def download_raw_file(url: str, raw_path: Path) -> None:
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        raw_path.write_bytes(response.read())


def parse_minute_csv(raw_path: Path) -> list[tuple[int, float, float, float, float, float]]:
    rows: list[tuple[int, float, float, float, float, float]] = []
    with raw_path.open(newline="") as f:
        reader = csv.reader(f)
        for parts in reader:
            if not parts:
                continue
            if parts[0].startswith("https://") or parts[0] == "Unix":
                continue
            if len(parts) < 8:
                continue
            # Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,...
            ts = int(parts[0])
            o = float(parts[3])
            h = float(parts[4])
            l = float(parts[5])
            c = float(parts[6])
            v = float(parts[7])
            rows.append((ts, o, h, l, c, v))
    return rows


def aggregate_to_15m(rows: list[tuple[int, float, float, float, float, float]]) -> list[dict[str, str]]:
    bucket_ms = 15 * 60 * 1000
    buckets: dict[int, list[tuple[int, float, float, float, float, float]]] = defaultdict(list)
    for row in rows:
        ts = row[0]
        bucket = ts - (ts % bucket_ms)
        buckets[bucket].append(row)

    aggregated: list[dict[str, str]] = []
    for bucket in sorted(buckets):
        items = sorted(buckets[bucket], key=lambda x: x[0])
        aggregated.append(
            {
                "timestamp": str(bucket),
                "open": str(items[0][1]),
                "high": str(max(i[2] for i in items)),
                "low": str(min(i[3] for i in items)),
                "close": str(items[-1][4]),
                "volume": str(sum(i[5] for i in items)),
            }
        )
    return aggregated


def write_output(rows: list[dict[str, str]], header: list[str]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(rows)


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts / 1000, tz=UTC).isoformat()


def main() -> None:
    header, ref_rows, ref_start, ref_end = read_reference_schema()

    attempts: list[DownloadAttempt] = []
    minute_rows: list[tuple[int, float, float, float, float, float]] = []

    for url in SOURCE_URLS:
        raw_path = RAW_DIR / Path(url).name
        try:
            download_raw_file(url, raw_path)
            minute_rows.extend(parse_minute_csv(raw_path))
            attempts.append(DownloadAttempt(url=url, raw_path=str(raw_path), status="success"))
        except urllib.error.URLError as exc:
            attempts.append(
                DownloadAttempt(url=url, raw_path=str(raw_path), status="failed", error=f"URLError: {exc}")
            )
        except Exception as exc:
            attempts.append(
                DownloadAttempt(
                    url=url,
                    raw_path=str(raw_path),
                    status="failed",
                    error=f"{type(exc).__name__}: {exc}",
                )
            )

    minute_rows.sort(key=lambda x: x[0])
    normalized_rows = aggregate_to_15m(minute_rows)

    if not normalized_rows:
        raise RuntimeError("BTCUSDT dataset download/normalization produced zero rows")

    write_output(normalized_rows, header)

    first_ts = int(normalized_rows[0]["timestamp"])
    last_ts = int(normalized_rows[-1]["timestamp"])

    manifest = {
        "generatedAt": datetime.now(tz=UTC).isoformat(),
        "symbol": "BTCUSDT",
        "reference": {
            "path": str(REFERENCE_PATH),
            "rowCount": ref_rows,
            "firstTimestamp": ref_start,
            "lastTimestamp": ref_end,
            "firstIso": iso(ref_start),
            "lastIso": iso(ref_end),
            "schema": header,
        },
        "source": {
            "name": "raw.githubusercontent.com/linner888-maker/Binance_BTCUSDT_2025",
            "urls": SOURCE_URLS,
        },
        "downloads": [asdict(a) for a in attempts],
        "output": {
            "path": str(OUTPUT_PATH),
            "rowCount": len(normalized_rows),
            "firstTimestamp": first_ts,
            "lastTimestamp": last_ts,
            "firstIso": iso(first_ts),
            "lastIso": iso(last_ts),
            "schema": header,
            "schemaCompatibleWithReference": True,
        },
        "notes": [
            "Coverage is limited to what the public source publishes; this source currently provides 2025 data.",
            "The output schema matches data/ETHUSDT_15m.csv exactly.",
        ],
    }

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
