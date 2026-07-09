import type { Poi } from "./types";

export type Nati = "전체" | "현지인" | "외지인";

export interface Filters {
  sido: string;
  sgg: string;
  lcls: string;
  mcls: string;
  nati: Nati;
}

export const ALL = "전체";

export const defaultFilters: Filters = {
  sido: ALL,
  sgg: ALL,
  lcls: ALL,
  mcls: ALL,
  nati: ALL,
};

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

export function aggregate(pois: Poi[], nati: Nati, nMonths: number, lowTh = 1.0): Aggregates {
  let totalVisitors = 0;
  let totalEmission = 0;
  let lowCarbonCount = 0;
  const sidos = new Set<string>();
  const sggs = new Set<string>();
  const emissions: number[] = [];

  for (const p of pois) {
    const v = poiVisitors(p, nati);
    const e = (v * p.pc) / 1000;
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
): Group[] {
  const map = new Map<string, Group>();
  for (const p of pois) {
    const key = keyFn(p);
    let g = map.get(key);
    if (!g) {
      g = { key, label: labelFn ? labelFn(p) : key, visitors: 0, emission: 0, nPoi: 0 };
      map.set(key, g);
    }
    g.visitors += poiVisitors(p, nati);
    g.emission += poiEmission(p, nati);
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
): { visitors: number[]; emission: number[] } {
  const visitors = new Array(nMonths).fill(0);
  const emission = new Array(nMonths).fill(0);
  for (const p of pois) {
    const arr = monthly[p.id];
    if (!arr) continue;
    // 현지인/외지인 비율로 월별 방문자 근사 분배
    const ratio = p.v ? poiVisitors(p, nati) / p.v : 1;
    for (let i = 0; i < nMonths; i++) {
      const v = arr[i] * ratio;
      visitors[i] += v;
      emission[i] += (v * p.pc) / 1000;
    }
  }
  return { visitors, emission };
}
