import type { PeriodSeason } from "./season";
import type { Poi } from "./types";
import { fmtNum } from "./format";

export interface RegionGuideAdvice {
  cautions: string[];
  suggestionLines: string[];
  routePath: string;
}

type TransportMode = "walk" | "bike" | "bus" | "subway" | "intercity_bus" | "train" | "shuttle";

interface RouteSegment {
  from: Poi;
  to: Poi;
  km: number;
  mode: TransportMode;
  modeLabel: string;
  savingPct: number;
}

const URBAN_SIDO = new Set([
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
]);

const ORDINAL = ["①", "②", "③", "④"];

/** 승용차 1인 기준 gCO₂/인·km (공공 통계 평균치 근사) */
const CAR_G_PER_KM = 120;
const MODE_G_PER_KM: Record<TransportMode, number> = {
  walk: 0,
  bike: 6,
  bus: 35,
  subway: 28,
  intercity_bus: 32,
  train: 18,
  shuttle: 42,
};

const MODE_LABEL: Record<TransportMode, string> = {
  walk: "도보",
  bike: "자전거·공유킥보드",
  bus: "시내버스",
  subway: "지하철·전철",
  intercity_bus: "시외·광역버스",
  train: "기차·KTX·ITX",
  shuttle: "관광셔틀·마을버스",
};

/** 추천 코스 POI 기반 동선·구간별 교통 조언 */
export function buildRegionGuideAdvice(input: {
  course: Poi[];
  sido: string;
  travelerType: string;
  period?: PeriodSeason;
  routeSeasonNote?: string;
}): RegionGuideAdvice {
  const { course, sido, travelerType, period, routeSeasonNote } = input;
  const route = optimizeRouteOrder(course);

  if (!route.length) {
    return {
      cautions: ["추천 코스 POI가 없어 동선을 구성할 수 없습니다."],
      suggestionLines: ["저탄소 POI를 선택한 뒤 다시 확인해 주세요."],
      routePath: "",
    };
  }

  if (route.length === 1) {
    const p = route[0];
    return {
      cautions: [
        `${shortName(p.nm)} 방문 시 ${p.sgg} 시내버스·마을버스 환승으로 접근하면 자가용 주차·순환 이동 탄소를 줄일 수 있습니다.`,
        `${p.lcls} 유형 POI는 체류 중 냉난방·일회용품 사용이 배출을 키울 수 있어, 짧고 집중적인 관람을 권장합니다.`,
        travelerReachTip(travelerType, p.sgg),
      ],
      suggestionLines: [
        `추천 스팟: ${p.nm}`,
        `${p.sgg} 중심 당일 코스 · 대중교통 환승 1회 이내로 접근`,
        `1인당 ${fmtNum(p.pc, 2)} kgCO₂e · 저탄소 단일 POI 집중형`,
      ],
      routePath: p.nm,
    };
  }

  const segments = buildSegments(route, sido, travelerType, period);
  const cautions = segments.slice(0, 3).map((seg, i) => formatSegmentCaution(seg, i + 1, period));

  const avgSaving =
    segments.reduce((s, seg) => s + seg.savingPct, 0) / Math.max(segments.length, 1);

  const legSummary = segments
    .map(
      (seg, i) =>
        `${ORDINAL[i] ?? `${i + 1}.`}${shortName(seg.from.nm)}→${shortName(seg.to.nm)} ${seg.modeLabel}(${fmtNum(seg.km, 1)}km)`,
    )
    .join(" · ");

  const suggestionLines = [
    period?.seasonActive
      ? `${period.label} 시즌 추천 동선: ${route.map((p) => shortName(p.nm)).join(" → ")}`
      : `추천 동선: ${route.map((p) => shortName(p.nm)).join(" → ")}`,
    legSummary,
    `자가용 일정 대비 이동 탄소 약 ${fmtNum(avgSaving, 0)}% 절감 가능`,
  ];
  if (routeSeasonNote) suggestionLines.push(routeSeasonNote);

  return {
    cautions,
    suggestionLines,
    routePath: route.map((p) => p.nm).join(" → "),
  };
}

function optimizeRouteOrder(pois: Poi[]): Poi[] {
  if (pois.length <= 1) return [...pois];
  const remaining = [...pois];
  const ordered: Poi[] = [remaining.shift()!];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(last.lon, last.lat, remaining[i].lon, remaining[i].lat);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

function buildSegments(
  route: Poi[],
  sido: string,
  travelerType: string,
  period?: PeriodSeason,
): RouteSegment[] {
  const segments: RouteSegment[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i];
    const to = route[i + 1];
    const km = haversineKm(from.lon, from.lat, to.lon, to.lat);
    const { mode, modeLabel } = pickMode(km, from, to, sido, travelerType, period);
    segments.push({
      from,
      to,
      km,
      mode,
      modeLabel,
      savingPct: savingVsCar(mode, km),
    });
  }
  return segments;
}

function pickMode(
  km: number,
  from: Poi,
  to: Poi,
  sido: string,
  travelerType: string,
  period?: PeriodSeason,
): { mode: TransportMode; modeLabel: string } {
  const urban = URBAN_SIDO.has(sido);
  const sameSgg = from.sgg === to.sgg;
  const natureHeavy = /자연|레저/.test(`${from.lcls}${to.lcls}`);
  const senior = travelerType === "시니어 여행";
  const family = travelerType === "가족 여행";
  const winter = period?.seasonActive && period.seasons.includes("winter");
  const summer = period?.seasonActive && period.seasons.includes("summer");

  if (winter && km >= 8) {
    return { mode: "train", modeLabel: "기차·버스(겨울철 결빙 구간)" };
  }
  if (summer && natureHeavy && km >= 3) {
    return { mode: "shuttle", modeLabel: "관광셔틀·시내버스(성수기)" };
  }
  if (km < 0.9 && !senior) {
    return { mode: "walk", modeLabel: MODE_LABEL.walk };
  }
  if (km < 0.9 && senior) {
    return { mode: "bus", modeLabel: "마을버스·시내버스" };
  }
  if (km < 2.5 && !family && !senior) {
    return { mode: "bike", modeLabel: MODE_LABEL.bike };
  }
  if (km < 8 && sameSgg) {
    if (urban) return { mode: "subway", modeLabel: MODE_LABEL.subway };
    return { mode: "bus", modeLabel: MODE_LABEL.bus };
  }
  if (km < 8) {
    return { mode: "bus", modeLabel: MODE_LABEL.bus };
  }
  if (km < 25) {
    if (natureHeavy) return { mode: "shuttle", modeLabel: MODE_LABEL.shuttle };
    return { mode: "intercity_bus", modeLabel: MODE_LABEL.intercity_bus };
  }
  if (km < 70) {
    return { mode: "intercity_bus", modeLabel: MODE_LABEL.intercity_bus };
  }
  return { mode: "train", modeLabel: MODE_LABEL.train };
}

function savingVsCar(mode: TransportMode, km: number): number {
  if (km <= 0) return 0;
  const car = CAR_G_PER_KM * km;
  const alt = MODE_G_PER_KM[mode] * km;
  return Math.min(95, Math.max(0, ((car - alt) / car) * 100));
}

function formatSegmentCaution(seg: RouteSegment, step: number, period?: PeriodSeason): string {
  const ord = ORDINAL[step - 1] ?? `${step}.`;
  const from = shortName(seg.from.nm);
  const to = shortName(seg.to.nm);
  const dist = fmtNum(seg.km, 1);
  const save = fmtNum(seg.savingPct, 0);
  const seasonTag = period?.seasonActive && period.label ? ` · ${period.label} 시즌` : "";

  if (seg.mode === "walk") {
    return `${ord}${from} → ${to} (약 ${dist}km${seasonTag}): 도보 이동을 권장합니다. 승용차 이용 시 대비 이동 탄소 약 ${save}% 절감됩니다.`;
  }
  if (seg.mode === "bike") {
    return `${ord}${from} → ${to} (약 ${dist}km${seasonTag}): 자전거·공유 모빌리티 이용 시 자가용 대비 약 ${save}% 이동 탄소를 줄일 수 있습니다.`;
  }
  if (seg.mode === "subway") {
    return `${ord}${from} → ${to} (약 ${dist}km${seasonTag}): 지하철·전철 환승을 이용하세요. 자가용 대비 약 ${save}% 이동 탄소 절감이 가능합니다.`;
  }
  if (seg.mode === "shuttle") {
    return `${ord}${from} → ${to} (약 ${dist}km${seasonTag}): 관광셔틀·마을버스를 이용하면 산간·해안 구간 자가용 의존도를 낮출 수 있습니다(약 ${save}% 절감).`;
  }
  if (seg.mode === "train") {
    return `${ord}${from} → ${to} (약 ${dist}km${seasonTag}): 기차·KTX·ITX로 이동하고, 현지에서는 버스·셔틀로 환승하세요(자가용 대비 약 ${save}% 절감).`;
  }
  if (seg.mode === "intercity_bus") {
    return `${ord}${from} → ${to} (약 ${dist}km${seasonTag}): 시외·광역버스 이용을 권장합니다. 장거리 자가용 이동 대비 약 ${save}% 탄소를 줄일 수 있습니다.`;
  }
  return `${ord}${from} → ${to} (약 ${dist}km${seasonTag}): 시내버스·마을버스를 이용하세요. 자가용 대비 약 ${save}% 이동 탄소 절감이 가능합니다.`;
}

function travelerReachTip(travelerType: string, sgg: string): string {
  const tips: Record<string, string> = {
    "가족 여행": `${sgg} 시내버스·셔틀을 이용하면 유모차 동반 이동 시에도 자가용 대비 탄소를 줄일 수 있습니다.`,
    "커플 여행": `인근 POI를 도보·버스로 연결하면 짧은 거리 이동에서 자가용 탄소를 크게 줄일 수 있습니다.`,
    "나홀로 여행": `환승 1~2회로 접근 가능한 노선을 선택하면 이동 탄소를 낮추면서 동선을 유연하게 잡을 수 있습니다.`,
    "친구 여행": `여러 명이 함께 이동할 때도 버스·기차를 이용하면 1인당 이동 탄소가 자가용보다 낮습니다.`,
    "시니어 여행": `마을버스·저상버스 노선을 활용하면 도보 부담을 줄이면서 이동 탄소를 낮출 수 있습니다.`,
  };
  return tips[travelerType] ?? `${sgg} 대중교통 환승으로 접근하면 자가용 대비 이동 탄소를 줄일 수 있습니다.`;
}

function shortName(nm: string, max = 12): string {
  return nm.length > max ? `${nm.slice(0, max)}…` : nm;
}

/** 위경도 직선거리 (km) */
function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
