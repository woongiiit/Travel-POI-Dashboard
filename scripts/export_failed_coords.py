# -*- coding: utf-8 -*-
"""
KTO 좌표 조회 실패 POI 목록 내보내기.

사용:
  python scripts/export_failed_coords.py
  python scripts/export_failed_coords.py --format csv
  python scripts/export_failed_coords.py --error NODATA
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from collections import Counter
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
COORDS_PATH = os.path.join(DATA, "poi_coords.json")
POIS_PATH = os.path.join(DATA, "pois.json")
OUT_JSON = os.path.join(DATA, "poi_coords_failed.json")
OUT_CSV = os.path.join(DATA, "poi_coords_failed.csv")


def load_pois_by_id() -> dict[str, dict]:
    with open(POIS_PATH, encoding="utf-8") as f:
        return {str(p["id"]): p for p in json.load(f)}


def build_failed_rows(coords: dict, pois: dict[str, dict], error_filter: str | None) -> list[dict]:
    rows: list[dict] = []
    for cid, entry in coords.items():
        if entry.get("source") != "failed":
            continue
        err = entry.get("error", "unknown")
        if error_filter and err != error_filter:
            continue
        p = pois.get(cid, {})
        rows.append({
            "id": cid,
            "error": err,
            "nm": p.get("nm", ""),
            "sido": p.get("sido", ""),
            "sgg": p.get("sgg", ""),
            "lcls": p.get("lcls", ""),
            "mcls": p.get("mcls", ""),
            "visitors": p.get("v", 0),
            "emission": p.get("e", 0),
            "lon": p.get("lon"),
            "lat": p.get("lat"),
        })
    rows.sort(key=lambda r: (r["error"], r["sido"], r["nm"]))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="KTO 좌표 조회 실패 POI 목록 내보내기")
    parser.add_argument("--error", help="특정 오류만 (예: NODATA, HTTP 429)")
    parser.add_argument("--format", choices=("json", "csv", "both"), default="both")
    args = parser.parse_args()

    if not os.path.isfile(COORDS_PATH):
        print(f"ERROR: {COORDS_PATH} 없음. fetch_poi_coords.py 먼저 실행", file=__import__("sys").stderr)
        raise SystemExit(1)

    with open(COORDS_PATH, encoding="utf-8") as f:
        doc = json.load(f)
    coords = doc.get("coords", {})
    pois = load_pois_by_id()
    rows = build_failed_rows(coords, pois, args.error)

    summary = Counter(r["error"] for r in rows)
    meta = {
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalFailed": len(rows),
        "byError": dict(summary.most_common()),
        "errorFilter": args.error,
    }

    if args.format in ("json", "both"):
        out = {"meta": meta, "failed": rows}
        with open(OUT_JSON, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print(f"wrote {OUT_JSON} ({len(rows)} rows)")

    if args.format in ("csv", "both"):
        fields = ["id", "error", "nm", "sido", "sgg", "lcls", "mcls", "visitors", "emission", "lon", "lat"]
        with open(OUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"wrote {OUT_CSV} ({len(rows)} rows)")

    print("\n오류별 건수:")
    for err, n in summary.most_common():
        print(f"  {err}: {n}")


if __name__ == "__main__":
    main()
