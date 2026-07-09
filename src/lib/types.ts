export interface Poi {
  id: string;
  nm: string;
  sido: string;
  sgg: string;
  lcls: string;
  mcls: string;
  scls: string;
  /** 총 방문자수 */
  v: number;
  /** 현지인 방문자수 */
  vL: number;
  /** 외지인 방문자수 */
  vO: number;
  /** 총 탄소배출량 (tCO2e) */
  e: number;
  /** 1인당 배출계수 (kgCO2e/인) */
  pc: number;
  lon: number;
  lat: number;
}

export interface MonthPoint {
  ym: string;
  visitors: number;
  emission: number;
}

export interface CategoryRoll {
  lcls?: string;
  mcls?: string;
  visitors: number;
  emission: number;
  nPoi: number;
  share: number;
}

export interface RegionRoll {
  sido: string;
  sgg?: string;
  visitors: number;
  emission: number;
  nPoi: number;
  lon?: number;
  lat?: number;
}

export interface TopPoi {
  id: string;
  nm: string;
  sido: string;
  sgg: string;
  visitors: number;
  emission: number;
}

export interface Kpis {
  nPoi: number;
  totalVisitors: number;
  totalEmission: number;
  perPoiAvgKg: number;
  perCapitaKg: number;
  top10Share: number;
  lowCarbonCount: number;
  nSido: number;
  nSgg: number;
}

export interface Meta {
  ymList: string[];
  ymMin: string;
  ymMax: string;
  nMonths: number;
  updatedAt: string;
  filters: {
    sido: string[];
    sggBySido: Record<string, string[]>;
    lcls: string[];
    mclsByLcls: Record<string, string[]>;
    nati: string[];
  };
  kpis: Kpis;
  national_monthly: MonthPoint[];
  lclsRollup: CategoryRoll[];
  mclsRollup: CategoryRoll[];
  sidoRollup: RegionRoll[];
  sggRollup: RegionRoll[];
  top10: TopPoi[];
}

export interface PoiDetail {
  id: string;
  title?: string;
  addr?: string;
  image?: string | null;
  thumbnail?: string | null;
  mapx?: number | null;
  mapy?: number | null;
  tel?: string | null;
  overview?: string | null;
  source: "kto" | "fallback";
  /** fallback일 때 원인 (키 미설정, API 오류 등) */
  error?: string;
}
