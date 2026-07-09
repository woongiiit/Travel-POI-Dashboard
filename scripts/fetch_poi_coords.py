# -*- coding: utf-8 -*-
"""
KTO API POI 실좌표 수집 → data/poi_coords.json 캐시.

기본: areaBasedSyncList2 일괄 목록(~500회) → contentId 매칭
보조: detailCommon2 개별 조회 (--mode detail, 미매칭분만)

사용:
  python scripts/fetch_poi_coords.py                    # bulk (기본)
  python scripts/fetch_poi_coords.py --mode detail      # 개별 조회(느림)
  python scripts/fetch_poi_coords.py --detail-fallback  # bulk 후 미매칭 detail
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timezone

from kto_api import (
    fetch_detail_common_with_retry,
    fetch_sync_list_page_with_retry,
    is_transient_error,
    load_service_key,
    parse_item_coord,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
COORDS_PATH = os.path.join(DATA, "poi_coords.json")
POIS_PATH = os.path.join(DATA, "pois.json")
SAVE_EVERY_PAGES = 10
SAVE_EVERY_DETAIL = 25


def load_coords_file() -> dict:
    if os.path.isfile(COORDS_PATH):
        with open(COORDS_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"version": 2, "updatedAt": None, "syncMeta": {}, "coords": {}}


def save_coords_file(doc: dict) -> None:
    doc["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(DATA, exist_ok=True)
    with open(COORDS_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(COORDS_PATH) / 1024
    print(f"  saved {COORDS_PATH} ({size_kb:.1f} KB)", flush=True)


def load_poi_ids() -> list[str]:
    if not os.path.isfile(POIS_PATH):
        print(f"ERROR: {POIS_PATH} 없음. 먼저 python scripts/build_data.py 실행", file=sys.stderr)
        sys.exit(1)
    with open(POIS_PATH, encoding="utf-8") as f:
        pois = json.load(f)
    return [str(p["id"]) for p in pois]


def apply_coords_to_pois(coords: dict) -> int:
    with open(POIS_PATH, encoding="utf-8") as f:
        pois = json.load(f)
    n = 0
    for p in pois:
        entry = coords.get(str(p["id"]))
        if entry and entry.get("source") == "kto":
            p["lon"] = entry["lon"]
            p["lat"] = entry["lat"]
            n += 1
    with open(POIS_PATH, "w", encoding="utf-8") as f:
        json.dump(pois, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  patched pois.json: {n}/{len(pois)} with KTO coords", flush=True)
    return n


def coord_stats(coords: dict, total_ids: int) -> dict[str, int]:
    kto = sum(1 for e in coords.values() if e.get("source") == "kto")
    failed = sum(1 for e in coords.values() if e.get("source") == "failed")
    return {
        "total": total_ids,
        "kto": kto,
        "failed": failed,
        "pending": total_ids - kto - failed,
    }


def run_bulk(
    doc: dict,
    coords: dict,
    poi_id_set: set[str],
    *,
    delay: float,
    num_of_rows: int,
    start_page: int,
    max_pages: int,
    showflag: str | None,
    key: str,
) -> int:
    """areaBasedSyncList2 페이지 순회 → POI contentId 매칭. 신규 kto 건수 반환."""
    sync_meta = doc.setdefault("syncMeta", {})
    page_no = start_page
    total_pages: int | None = sync_meta.get("totalPages")
    new_n = 0
    pages_done = 0

    while True:
        result = fetch_sync_list_page_with_retry(
            page_no,
            num_of_rows=num_of_rows,
            showflag=showflag,
            key=key,
        )
        if not result["ok"]:
            print(f"  sync page {page_no} error: {result.get('error')}", flush=True)
            if is_transient_error(result.get("error")):
                sync_meta["lastFailedPage"] = page_no
                save_coords_file(doc)
                print("  transient error — 재실행 시 해당 페이지부터 resume", flush=True)
            break

        if total_pages is None:
            total = result.get("total_count", 0)
            total_pages = max(1, math.ceil(total / num_of_rows))
            sync_meta["totalCount"] = total
            sync_meta["totalPages"] = total_pages
            sync_meta["numOfRows"] = num_of_rows
            print(
                f"  KTO sync total {total} items / {total_pages} pages",
                flush=True,
            )
            if max_pages > 0:
                total_pages = min(total_pages, start_page - 1 + max_pages)

        page_new = 0
        for item in result.get("items", []):
            parsed = parse_item_coord(item)
            if not parsed:
                continue
            cid = parsed["content_id"]
            if cid not in poi_id_set:
                continue
            prev = coords.get(cid)
            if prev and prev.get("source") == "kto":
                continue
            coords[cid] = {
                "lon": parsed["lon"],
                "lat": parsed["lat"],
                "source": "kto",
                "via": "sync",
            }
            page_new += 1
            new_n += 1
            if prev and prev.get("source") == "failed":
                pass  # 429/NODATA 캐시 덮어씀

        pages_done += 1
        matched = sum(1 for e in coords.values() if e.get("source") == "kto")
        if pages_done % SAVE_EVERY_PAGES == 0 or page_no >= (total_pages or page_no):
            sync_meta["lastCompletedPage"] = page_no
            sync_meta["matchedPois"] = matched
            save_coords_file(doc)
            print(
                f"  page {page_no}/{total_pages} (+{page_new} this page, "
                f"total kto {matched}/{len(poi_id_set)})",
                flush=True,
            )

        if page_no >= (total_pages or page_no):
            sync_meta["lastCompletedPage"] = page_no
            if max_pages <= 0:
                sync_meta["completed"] = True
            save_coords_file(doc)
            break

        page_no += 1
        if delay > 0:
            time.sleep(delay)

    return new_n


def run_detail(
    coords: dict,
    pending: list[str],
    *,
    delay: float,
    key: str,
    doc: dict,
) -> tuple[int, int]:
    ok_n = 0
    fail_n = 0
    for i, cid in enumerate(pending, 1):
        result = fetch_detail_common_with_retry(cid, key=key)
        if result["ok"]:
            coords[cid] = {"lon": result["lon"], "lat": result["lat"], "source": "kto", "via": "detail"}
            ok_n += 1
        elif is_transient_error(result.get("error")):
            coords.pop(cid, None)
            fail_n += 1
        else:
            coords[cid] = {"source": "failed", "error": result.get("error", "unknown")}
            fail_n += 1
            if fail_n <= 5:
                print(f"  fail {cid}: {result.get('error')}", flush=True)

        if i % SAVE_EVERY_DETAIL == 0 or i == len(pending):
            save_coords_file(doc)
            print(f"  detail {i}/{len(pending)} (+{ok_n} ok, +{fail_n} fail)", flush=True)

        if i < len(pending) and delay > 0:
            time.sleep(delay)

    return ok_n, fail_n


def main() -> None:
    parser = argparse.ArgumentParser(description="KTO POI 실좌표 수집")
    parser.add_argument(
        "--mode",
        choices=("bulk", "detail"),
        default="bulk",
        help="bulk=areaBasedSyncList2(기본), detail=개별 detailCommon2",
    )
    parser.add_argument("--delay", type=float, default=0.35, help="요청 간격(초)")
    parser.add_argument("--rows", type=int, default=100, help="bulk 페이지당 건수")
    parser.add_argument("--start-page", type=int, default=0, help="bulk 시작 페이지(0=resume)")
    parser.add_argument("--max-pages", type=int, default=0, help="bulk 페이지 상한(0=전체)")
    parser.add_argument(
        "--showflag",
        default="1",
        help="bulk showflag (1=노출, all=전체)",
    )
    parser.add_argument(
        "--detail-fallback",
        action="store_true",
        help="bulk 완료 후 미매칭 POI만 detailCommon2 조회",
    )
    parser.add_argument("--limit", type=int, default=0, help="detail 모드 조회 상한")
    parser.add_argument("--retry-failed", action="store_true", help="detail: failed 재시도")
    parser.add_argument("--force-resync", action="store_true", help="bulk 처음부터 재수집")
    parser.add_argument("--no-apply", action="store_true", help="pois.json 반영 생략")
    args = parser.parse_args()

    key = load_service_key()
    if not key:
        print("ERROR: KTO_SERVICE_KEY 미설정 (.env.local)", file=sys.stderr)
        sys.exit(1)

    all_ids = load_poi_ids()
    poi_id_set = set(all_ids)
    doc = load_coords_file()
    coords = doc.setdefault("coords", {})
    stats_before = coord_stats(coords, len(all_ids))
    print(
        f"POI {len(all_ids)} | KTO {stats_before['kto']} | "
        f"failed {stats_before['failed']} | pending {stats_before['pending']}",
        flush=True,
    )

    showflag = None if args.showflag == "all" else args.showflag

    if args.mode == "bulk":
        sync_meta = doc.setdefault("syncMeta", {})
        if args.force_resync:
            sync_meta.clear()
            doc["syncMeta"] = sync_meta

        start_page = args.start_page
        if start_page <= 0:
            if sync_meta.get("completed") and not args.force_resync:
                print("  bulk already completed (use --force-resync to re-fetch)", flush=True)
                start_page = 0
            elif sync_meta.get("lastFailedPage") and not sync_meta.get("completed"):
                start_page = int(sync_meta["lastFailedPage"])
            else:
                start_page = int(sync_meta.get("lastCompletedPage") or 0) + 1

        if start_page > 0:
            if start_page > 1:
                print(f"  resume from page {start_page}", flush=True)
            new_n = run_bulk(
                doc,
                coords,
                poi_id_set,
                delay=args.delay,
                num_of_rows=args.rows,
                start_page=start_page,
                max_pages=args.max_pages,
                showflag=showflag,
                key=key,
            )
            print(f"bulk done: +{new_n} new coords", flush=True)
        else:
            new_n = 0

        if args.detail_fallback:
            pending = [
                cid
                for cid in all_ids
                if not (coords.get(cid) and coords.get(cid, {}).get("source") == "kto")
            ]
            if args.limit > 0:
                pending = pending[: args.limit]
            if pending:
                print(f"detail fallback: {len(pending)} POIs", flush=True)
                run_detail(coords, pending, delay=args.delay, key=key, doc=doc)

    else:
        pending = []
        for cid in all_ids:
            entry = coords.get(cid)
            if entry and entry.get("source") == "kto":
                continue
            if entry and entry.get("source") == "failed":
                err = entry.get("error", "")
                if not args.retry_failed and not is_transient_error(err):
                    continue
            pending.append(cid)
        if args.limit > 0:
            pending = pending[: args.limit]
        if not pending:
            print("detail: 조회할 항목 없음.")
        else:
            print(f"detail: {len(pending)} POIs", flush=True)
            run_detail(coords, pending, delay=args.delay, key=key, doc=doc)

    save_coords_file(doc)
    stats_after = coord_stats(coords, len(all_ids))
    print(
        f"DONE: KTO {stats_after['kto']}/{stats_after['total']} "
        f"(failed {stats_after['failed']}, jitter fallback {stats_after['pending']})",
        flush=True,
    )

    if not args.no_apply:
        apply_coords_to_pois(coords)


if __name__ == "__main__":
    main()
