import "server-only";
import type { PoiDetail } from "./types";

const BASE = process.env.KTO_API_BASE ?? "https://apis.data.go.kr/B551011/KorService2";

interface CacheEntry {
  data: PoiDetail;
  ts: number;
}
const cache = new Map<string, CacheEntry>();
const TTL = 1000 * 60 * 60 * 24; // 24h

function getKey(): string {
  return process.env.KTO_SERVICE_KEY?.trim() ?? "";
}

/**
 * KorService2 GW detailCommon2 — 공공데이터포털 스펙 기준 최소 파라미터만 사용.
 * @see https://www.data.go.kr/data/15101578/openapi.do
 * 구 KorService1의 defaultYN/addrinfoYN 등은 GW API에서 INVALID_REQUEST_PARAMETER_ERROR 발생.
 */
function buildUrl(endpoint: string, params: Record<string, string>): string {
  const sp = new URLSearchParams({
    MobileOS: "WEB",
    MobileApp: "APP",
    _type: "json",
    ...params,
  });
  const key = getKey();
  return `${BASE}/${endpoint}?${sp.toString()}&serviceKey=${encodeURIComponent(key)}`;
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`KTO API HTTP ${res.status}`);
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

interface KtoItem {
  contentid?: string;
  title?: string;
  addr1?: string;
  addr2?: string;
  firstimage?: string;
  firstimage2?: string;
  mapx?: string;
  mapy?: string;
  tel?: string;
  overview?: string;
}

function apiError(json: unknown): string | null {
  const root = json as Record<string, unknown>;
  // GW 오류 응답: { resultCode, resultMsg } (최상위)
  if (root.resultCode && root.resultCode !== "0000" && root.resultCode !== "00") {
    return String(root.resultMsg ?? root.resultCode);
  }
  const header = (root.response as { header?: { resultCode?: string; resultMsg?: string } })?.header;
  if (header?.resultCode && header.resultCode !== "0000" && header.resultCode !== "00") {
    return header.resultMsg ?? header.resultCode;
  }
  return null;
}

function pickItem(json: unknown): KtoItem | null {
  const items = (json as { response?: { body?: { items?: { item?: KtoItem | KtoItem[] } } } })
    ?.response?.body?.items?.item;
  if (!items) return null;
  return Array.isArray(items) ? items[0] ?? null : items;
}

function normalizeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  // 혼합 콘텐츠 방지: http → https
  return url.startsWith("http://") ? url.replace("http://", "https://") : url;
}

function fallback(contentId: string, reason?: string): PoiDetail {
  return {
    id: contentId,
    source: "fallback",
    image: null,
    thumbnail: null,
    error: reason,
  };
}

/** contentId로 사진/좌표/주소 등 상세 조회. 키 미설정/오류 시 fallback 반환. */
export async function getPoiDetail(contentId: string): Promise<PoiDetail> {
  const cached = cache.get(contentId);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const key = getKey();
  if (!key) {
    return fallback(contentId, "KTO_SERVICE_KEY 미설정");
  }

  try {
    const url = buildUrl("detailCommon2", { contentId });
    const json = await fetchJson(url);

    const err = apiError(json);
    if (err) {
      console.warn(`[KTO] detailCommon2 ${contentId}: ${err}`);
      return fallback(contentId, err);
    }

    const item = pickItem(json);
    if (!item) {
      return fallback(contentId, "NODATA");
    }

    const detail: PoiDetail = {
      id: contentId,
      source: "kto",
      title: item.title,
      addr: [item.addr1, item.addr2].filter(Boolean).join(" ").trim() || undefined,
      image: normalizeImageUrl(item.firstimage),
      thumbnail: normalizeImageUrl(item.firstimage2 || item.firstimage),
      mapx: item.mapx ? Number(item.mapx) : null,
      mapy: item.mapy ? Number(item.mapy) : null,
      tel: item.tel || null,
      overview: item.overview ? stripHtml(item.overview) : null,
    };
    cache.set(contentId, { data: detail, ts: Date.now() });
    return detail;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.warn(`[KTO] detailCommon2 ${contentId} failed:`, msg);
    return fallback(contentId, msg);
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}
