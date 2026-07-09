# -*- coding: utf-8 -*-
"""한국관광공사 KorService2 클라이언트 (빌드·배치 스크립트용)."""
from __future__ import annotations

import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterator

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BASE = "https://apis.data.go.kr/B551011/KorService2"

TRANSIENT_ERRORS = ("HTTP 429", "HTTP 502", "HTTP 503", "TIMEOUT")


def load_service_key() -> str:
    key = os.environ.get("KTO_SERVICE_KEY", "").strip()
    if key:
        return key
    env_path = os.path.join(ROOT, ".env.local")
    if os.path.isfile(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                if line.startswith("KTO_SERVICE_KEY="):
                    return line.strip().split("=", 1)[1].strip()
    return ""


def load_api_base() -> str:
    base = os.environ.get("KTO_API_BASE", "").strip()
    return base or DEFAULT_BASE


def is_transient_error(error: str | None) -> bool:
    if not error:
        return False
    return any(error.startswith(prefix) for prefix in TRANSIENT_ERRORS)


def _api_error(json_obj: dict[str, Any]) -> str | None:
    if json_obj.get("resultCode") and json_obj["resultCode"] not in ("0000", "00"):
        return str(json_obj.get("resultMsg") or json_obj["resultCode"])
    header = json_obj.get("response", {}).get("header", {})
    code = header.get("resultCode")
    if code and code not in ("0000", "00"):
        return str(header.get("resultMsg") or code)
    return None


def _pick_items(json_obj: dict[str, Any]) -> list[dict[str, Any]]:
    body = json_obj.get("response", {}).get("body", {})
    if not isinstance(body, dict):
        return []
    items_wrap = body.get("items")
    if not items_wrap or isinstance(items_wrap, str):
        return []
    if not isinstance(items_wrap, dict):
        return []
    items = items_wrap.get("item")
    if not items:
        return []
    if isinstance(items, list):
        return [x for x in items if isinstance(x, dict)]
    if isinstance(items, dict):
        return [items]
    return []


def _fetch_json(url: str, timeout: float = 30) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_transport_error": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        return {"_transport_error": str(e.reason)}
    except json.JSONDecodeError:
        return {"_transport_error": "INVALID_JSON"}
    except TimeoutError:
        return {"_transport_error": "TIMEOUT"}


def _build_url(endpoint: str, params: dict[str, str], key: str) -> str:
    api_base = load_api_base()
    sp = urllib.parse.urlencode(params)
    return f"{api_base}/{endpoint}?{sp}&serviceKey={urllib.parse.quote(key, safe='')}"


def parse_item_coord(item: dict[str, Any]) -> dict[str, Any] | None:
    """목록 API item → { content_id, lon, lat } 또는 None."""
    cid = item.get("contentid")
    if cid is None:
        return None
    mapx = item.get("mapx")
    mapy = item.get("mapy")
    if mapx is None or mapy is None:
        return None
    try:
        lon = float(mapx)
        lat = float(mapy)
    except (TypeError, ValueError):
        return None
    if not (124 <= lon <= 132 and 33 <= lat <= 39):
        return None
    return {
        "content_id": str(cid),
        "lon": round(lon, 6),
        "lat": round(lat, 6),
    }


def fetch_sync_list_page(
    page_no: int,
    *,
    num_of_rows: int = 100,
    showflag: str | None = "1",
    key: str | None = None,
) -> dict[str, Any]:
    """
    areaBasedSyncList2 한 페이지 조회.
    반환: { ok, items, total_count, page_no, num_of_rows, error? }
    """
    service_key = key or load_service_key()
    if not service_key:
        return {"ok": False, "error": "KTO_SERVICE_KEY 미설정", "page_no": page_no}

    params: dict[str, str] = {
        "MobileOS": "WEB",
        "MobileApp": "APP",
        "_type": "json",
        "numOfRows": str(num_of_rows),
        "pageNo": str(page_no),
    }
    if showflag is not None:
        params["showflag"] = showflag

    url = _build_url("areaBasedSyncList2", params, service_key)
    json_obj = _fetch_json(url)

    transport = json_obj.get("_transport_error")
    if transport:
        return {"ok": False, "error": transport, "page_no": page_no}

    err = _api_error(json_obj)
    if err:
        return {"ok": False, "error": err, "page_no": page_no}

    body = json_obj.get("response", {}).get("body", {})
    total_count = int(body.get("totalCount") or 0)
    items = _pick_items(json_obj)
    return {
        "ok": True,
        "items": items,
        "total_count": total_count,
        "page_no": page_no,
        "num_of_rows": num_of_rows,
    }


def fetch_sync_list_page_with_retry(
    page_no: int,
    *,
    num_of_rows: int = 100,
    showflag: str | None = "1",
    key: str | None = None,
    max_retries: int = 6,
) -> dict[str, Any]:
    last: dict[str, Any] = {"ok": False, "error": "unknown", "page_no": page_no}
    for attempt in range(max_retries):
        last = fetch_sync_list_page(
            page_no, num_of_rows=num_of_rows, showflag=showflag, key=key
        )
        if last["ok"] or not is_transient_error(last.get("error")):
            return last
        time.sleep(min(60, 2 ** attempt))
    return last


def iter_sync_list_pages(
    *,
    num_of_rows: int = 100,
    showflag: str | None = "1",
    start_page: int = 1,
    max_pages: int = 0,
    delay: float = 0.35,
    key: str | None = None,
) -> Iterator[dict[str, Any]]:
    """areaBasedSyncList2 전 페이지 순회."""
    service_key = key or load_service_key()
    page_no = start_page
    total_pages: int | None = None

    while True:
        result = fetch_sync_list_page_with_retry(
            page_no,
            num_of_rows=num_of_rows,
            showflag=showflag,
            key=service_key,
        )
        yield result
        if not result["ok"]:
            break

        if total_pages is None:
            total = result.get("total_count", 0)
            total_pages = max(1, math.ceil(total / num_of_rows))
            if max_pages > 0:
                total_pages = min(total_pages, start_page - 1 + max_pages)

        if page_no >= (total_pages or page_no):
            break

        page_no += 1
        if delay > 0:
            time.sleep(delay)


def fetch_detail_common(
    content_id: str,
    *,
    key: str | None = None,
    timeout: float = 15,
) -> dict[str, Any]:
    """contentId로 detailCommon2 조회."""
    service_key = key or load_service_key()
    if not service_key:
        return {"ok": False, "error": "KTO_SERVICE_KEY 미설정"}

    params = {
        "MobileOS": "WEB",
        "MobileApp": "APP",
        "_type": "json",
        "contentId": str(content_id),
    }
    url = _build_url("detailCommon2", params, service_key)

    json_obj = _fetch_json(url, timeout=timeout)
    transport = json_obj.get("_transport_error")
    if transport:
        return {"ok": False, "error": transport}

    err = _api_error(json_obj)
    if err:
        return {"ok": False, "error": err}

    items = _pick_items(json_obj)
    if not items:
        return {"ok": False, "error": "NODATA"}

    parsed = parse_item_coord(items[0])
    if not parsed:
        return {"ok": False, "error": "NO_COORD"}

    return {"ok": True, "lon": parsed["lon"], "lat": parsed["lat"]}


def fetch_detail_common_with_retry(
    content_id: str,
    *,
    key: str | None = None,
    max_retries: int = 6,
) -> dict[str, Any]:
    last: dict[str, Any] = {"ok": False, "error": "unknown"}
    for attempt in range(max_retries):
        last = fetch_detail_common(content_id, key=key)
        if last["ok"] or not is_transient_error(last.get("error")):
            return last
        time.sleep(min(60, 2 ** attempt))
    return last
