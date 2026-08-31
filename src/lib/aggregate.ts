import type { Poi } from "./types";

export type Nati = "전체" | "현지인" | "외지인";

export interface Filters {
  sido: string;
  sgg: string;
  lcls: string;
  mcls: string;
  nati: Nati;
  /** YYYYMM — meta.ymList 범위 내 시작·종료월 */
  ymFrom: string;
  ymTo: string;
}

export const ALL = "전체";

export const defaultFilters: Filters = {
  sido: ALL,
  sgg: ALL,
  lcls: ALL,
  mcls: ALL,
  nati: ALL,
  ymFrom: "",
  ymTo: "",
};

/** meta 로드 후 기본 기간(전체) 설정 */
export function defaultFiltersForMeta(meta: { ymMin: string; ymMax: string }): Filters {
  return { ...defaultFilters, ymFrom: meta.ymMin, ymTo: meta.ymMax };
}

/** ymFrom~ymTo → ymList 인덱스 구간 (inclusive) */
export function resolveYmRange(
  ymList: string[],
  ymFrom: string,
  ymTo: string,
): { from: number; to: number; nMonths: number } {
  if (!ymFrom || !ymTo) {
    return { from: 0, to: ymList.length - 1, nMonths: ymList.length };
  }
  const from = ymList.indexOf(ymFrom);
  const to = ymList.indexOf(ymTo);
  if (from < 0 || to < 0) {
    return { from: 0, to: ymList.length - 1, nMonths: ymList.length };
  }
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return { from: lo, to: hi, nMonths: hi - lo + 1 };
}

/** 전체 기간 선택 여부 (pois.json 누적값 사용 가능) */
export function isFullYmRange(ymList: string[], ymFrom: string, ymTo: string): boolean {
  if (!ymList.length || !ymFrom || !ymTo) return true;
  return ymFrom === ymList[0] && ymTo === ymList[ymList.length - 1];
}

/** 선택 기간 내 POI 방문자·배출 (monthly 슬라이스) */
export function poiPeriodMetrics(
  p: Poi,
  monthly: Record<string, number[]>,
  from: number,
  to: number,
  nati: Nati,
): { visitors: number; emission: number } {
  const arr = monthly[p.id];
  if (!arr) return { visitors: 0, emission: 0 };
  let raw = 0;
  for (let i = from; i <= to; i++) raw += arr[i] ?? 0;
  const ratio = p.v ? poiVisitors(p, nati) / p.v : 1;
  const visitors = raw * ratio;
  const emission = (visitors * p.pc) / 1000;
  return { visitors, emission };
}

/** 선택 기간이 전체가 아니면 monthly 기반, 전체면 pois.json 누적값 */
export function poiScopedMetrics(
  p: Poi,
  nati: Nati,
  ymFrom: string,
  ymTo: string,
  ymList: string[],
  monthly: Record<string, number[]> | null,
): { visitors: number; emission: number } {
  if (isFullYmRange(ymList, ymFrom, ymTo) || !monthly) {
    return { visitors: poiVisitors(p, nati), emission: poiEmission(p, nati) };
  }
  const { from, to } = resolveYmRange(ymList, ymFrom, ymTo);
  return poiPeriodMetrics(p, monthly, from, to, nati);
}

/** nati 필터를 반영한 POI별 방문자수 */
export function poiVisitors(p: Poi, nati: Nati): number {
  if (nati === "현지인") return p.vL;
  if (nati === "외지인") return p.vO;
  return p.v;
}

/** nati 필터를 반영한 POI별 탄소배출량 (tCO2e) */
export function poiEmission(p: Poi, nati: Nati): number {
  return (poiVisitors(p, nati) * p.pc) / 1000;
}

export function applyFilters(pois: Poi[], f: Filters): Poi[] {
  return pois.filter((p) => {
    if (f.sido !== ALL && p.sido !== f.sido) return false;
    if (f.sgg !== ALL && p.sgg !== f.sgg) return false;
    if (f.lcls !== ALL && p.lcls !== f.lcls) return false;
    if (f.mcls !== ALL && p.mcls !== f.mcls) return false;
    return true;
  });
}

export interface Aggregates {
  count: number;
  totalVisitors: number;
  totalEmission: number;
  perPoiAvgKg: number;
  perCapitaKg: number;
  top10Share: number;
  lowCarbonCount: number;
  nSido: number;
  nSgg: number;
}

export function aggregate(
  pois: Poi[],
  nati: Nati,
  nMonths: number,
  lowTh = 1.0,
  metricsFn?: (p: Poi) => { visitors: number; emission: number },
): Aggregates {
  let totalVisitors = 0;
  let totalEmission = 0;
  let lowCarbonCount = 0;
  const sidos = new Set<string>();
  const sggs = new Set<string>();
  const emissions: number[] = [];

  for (const p of pois) {
    const { visitors: v, emission: e } = metricsFn
      ? metricsFn(p)
      : { visitors: poiVisitors(p, nati), emission: poiEmission(p, nati) };
    totalVisitors += v;
    totalEmission += e;
    emissions.push(e);
    if (p.pc <= lowTh) lowCarbonCount++;
    sidos.add(p.sido);
    sggs.add(p.sido + "|" + p.sgg);
  }

  emissions.sort((a, b) => b - a);
  const top10 = emissions.slice(0, 10).reduce((s, x) => s + x, 0);

  return {
    count: pois.length,
    totalVisitors,
    totalEmission,
    perPoiAvgKg: pois.length ? (totalEmission * 1000) / pois.length / nMonths : 0,
    perCapitaKg: totalVisitors ? (totalEmission * 1000) / totalVisitors : 0,
    top10Share: totalEmission ? (top10 / totalEmission) * 100 : 0,
    lowCarbonCount,
    nSido: sidos.size,
    nSgg: sggs.size,
  };
}

export interface VisitorBreakdown {
  local: number;
  outOfRegion: number;
}

/** 선택 기간 방문자를 POI별 vL/vO 비율로 현지인·외지인 안분 */
export function aggregateVisitorBreakdown(
  pois: Poi[],
  metricsFn: (p: Poi) => { visitors: number },
): VisitorBreakdown {
  let local = 0;
  let outOfRegion = 0;
  for (const p of pois) {
    const v = metricsFn(p).visitors;
    if (p.v > 0) {
      local += v * (p.vL / p.v);
      outOfRegion += v * (p.vO / p.v);
    } else {
      local += v;
    }
  }
  return { local, outOfRegion };
}

export function poiVisitorBreakdown(p: Poi, visitors: number): VisitorBreakdown {
  if (p.v > 0) {
    return {
      local: visitors * (p.vL / p.v),
      outOfRegion: visitors * (p.vO / p.v),
    };
  }
  return { local: visitors, outOfRegion: 0 };
}

export interface Group {
  key: string;
  label: string;
  visitors: number;
  emission: number;
  nPoi: number;
  extra?: Record<string, unknown>;
}

export function groupBy(
  pois: Poi[],
  nati: Nati,
  keyFn: (p: Poi) => string,
  labelFn?: (p: Poi) => string,
  metricsFn?: (p: Poi) => { visitors: number; emission: number },
): Group[] {
  const map = new Map<string, Group>();
  for (const p of pois) {
    const key = keyFn(p);
    let g = map.get(key);
    if (!g) {
      g = { key, label: labelFn ? labelFn(p) : key, visitors: 0, emission: 0, nPoi: 0 };
      map.set(key, g);
    }
    const m = metricsFn
      ? metricsFn(p)
      : { visitors: poiVisitors(p, nati), emission: poiEmission(p, nati) };
    g.visitors += m.visitors;
    g.emission += m.emission;
    g.nPoi += 1;
  }
  return [...map.values()].sort((a, b) => b.emission - a.emission);
}

/** 필터된 POI 집합의 월별 합계 (방문자수). monthly: id -> number[] (ymList 정렬) */
export function monthlySeries(
  pois: Poi[],
  monthly: Record<string, number[]>,
  nMonths: number,
  nati: Nati,
  fromIdx = 0,
  toIdx?: number,
): { visitors: number[]; emission: number[] } {
  const end = toIdx ?? nMonths - 1;
  const len = end - fromIdx + 1;
  const visitors = new Array(len).fill(0);
  const emission = new Array(len).fill(0);
  for (const p of pois) {
    const arr = monthly[p.id];
    if (!arr) continue;
    const ratio = p.v ? poiVisitors(p, nati) / p.v : 1;
    for (let i = 0; i < len; i++) {
      const v = (arr[fromIdx + i] ?? 0) * ratio;
      visitors[i] += v;
      emission[i] += (v * p.pc) / 1000;
    }
  }
  return { visitors, emission };
}
