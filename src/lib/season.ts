import type { Poi } from "./types";
import { fmtYmFull } from "./format";

export type Season = "winter" | "spring" | "summer" | "autumn";

export interface PeriodSeason {
  /** 계절 반영 적용 여부 (동일 연도 내 기간만 true) */
  seasonActive: boolean;
  /** "겨울~봄" | "연중" */
  label: string;
  /** 포함 계절 (중복 제거, 순서 유지) */
  seasons: Season[];
  /** 선택 기간 내 월 (1~12) */
  months: number[];
  /** "2023.01 ~ 2024.04" */
  periodLabel: string;
}

const SEASON_NAMES: Record<Season, string> = {
  winter: "겨울",
  spring: "봄",
  summer: "여름",
  autumn: "가을",
};

const SEASON_ORDER: Season[] = ["winter", "spring", "summer", "autumn"];

/** YYYYMM → 계절 (한국 관광 기준) */
export function monthToSeason(month: number): Season {
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

/** 동일 연도(YYYY) 내 기간인지 — 해가 넘어가면 계절 추천 비활성 */
function isSameCalendarYear(ymFrom: string, ymTo: string): boolean {
  if (!ymFrom || !ymTo) return false;
  return ymFrom.slice(0, 4) === ymTo.slice(0, 4);
}

/** 선택 기간의 계절 구성 분석 */
export function analyzePeriodSeason(
  ymList: string[],
  ymFrom: string,
  ymTo: string,
): PeriodSeason {
  const from = ymList.indexOf(ymFrom);
  const to = ymList.indexOf(ymTo);
  const lo = from >= 0 && to >= 0 ? Math.min(from, to) : 0;
  const hi = from >= 0 && to >= 0 ? Math.max(from, to) : ymList.length - 1;
  const slice = from >= 0 && to >= 0 ? ymList.slice(lo, hi + 1) : ymList;

  const periodLabel =
    slice.length > 0
      ? `${fmtYmFull(slice[0])} ~ ${fmtYmFull(slice[slice.length - 1])}`
      : "";

  const seasonActive = isSameCalendarYear(ymFrom, ymTo);

  if (!seasonActive) {
    return {
      seasonActive: false,
      label: "연중",
      seasons: [],
      months: [...new Set(slice.map((ym) => Number(ym.slice(4, 6))))].sort((a, b) => a - b),
      periodLabel,
    };
  }

  const months = [...new Set(slice.map((ym) => Number(ym.slice(4, 6))))].sort((a, b) => a - b);
  const seasonSet = new Set<Season>();
  for (const m of months) seasonSet.add(monthToSeason(m));
  const seasons = SEASON_ORDER.filter((s) => seasonSet.has(s));

  const label =
    seasons.length === 0
      ? "연중"
      : seasons.length === 1
        ? SEASON_NAMES[seasons[0]]
        : `${SEASON_NAMES[seasons[0]]}~${SEASON_NAMES[seasons[seasons.length - 1]]}`;

  return { seasonActive: true, label, seasons, months, periodLabel };
}

/** 계절별 대분류 가중치 */
const SEASON_LCLS: Record<Season, Partial<Record<string, number>>> = {
  winter: { 자연관광: 1.25, 레저스포츠: 1.2, 체험관광: 1.1, 역사관광: 1.05 },
  spring: { 자연관광: 1.3, 문화관광: 1.15, 역사관광: 1.1, 체험관광: 1.1 },
  summer: { 자연관광: 1.35, 레저스포츠: 1.25, 체험관광: 1.15, 음식: 1.05 },
  autumn: { 자연관광: 1.3, 역사관광: 1.2, 문화관광: 1.15, 음식: 1.1 },
};

/** POI명·중분류 키워드 기반 계절 적합도 */
const SEASON_KEYWORDS: Record<Season, RegExp> = {
  winter: /스키|눈|얼음|온천|빙어|겨울|설원|썰매|빙벽/i,
  spring: /벚꽃|진달래|유채|봄|튤립|매화|수국|꽃/i,
  summer: /해수욕|해변|계곡|수영|서핑|물놀이|해안|워터|캠핑/i,
  autumn: /단풍|가을|은행|축제|수확|감|배|사과|옥수수/i,
};

/** 선택 기간 내 월별 방문 패턴 — 해당 월에 상대적으로 인기 있으면 가중 */
export function poiSeasonalPopularity(
  p: Poi,
  monthly: Record<string, number[]> | null,
  ymList: string[],
  fromIdx: number,
  toIdx: number,
): number {
  if (!monthly) return 1;
  const arr = monthly[p.id];
  if (!arr?.length) return 1;

  let periodSum = 0;
  let periodCnt = 0;
  for (let i = fromIdx; i <= toIdx; i++) {
    periodSum += arr[i] ?? 0;
    periodCnt++;
  }
  const annualAvg = arr.reduce((s, v) => s + v, 0) / arr.length;
  const periodAvg = periodCnt ? periodSum / periodCnt : 0;
  if (!annualAvg) return 1;
  return Math.min(2.2, Math.max(0.65, periodAvg / annualAvg));
}

/** 계절·키워드·카테고리 종합 가중치 */
export function poiSeasonalWeight(
  p: Poi,
  period: PeriodSeason,
  monthly: Record<string, number[]> | null,
  ymList: string[],
  fromIdx: number,
  toIdx: number,
): number {
  const pop = poiSeasonalPopularity(p, monthly, ymList, fromIdx, toIdx);
  if (!period.seasonActive) return pop;

  const text = `${p.nm} ${p.mcls} ${p.scls}`;
  let boost = 1;

  for (const season of period.seasons) {
    if (SEASON_KEYWORDS[season].test(text)) boost *= 1.35;
    const lclsBoost = SEASON_LCLS[season][p.lcls];
    if (lclsBoost) boost *= lclsBoost;
  }

  boost *= pop;
  return Math.min(3, boost);
}

export interface SeasonGuideContent {
  regionSummary: string;
  courseNote: string;
  travelerHint: string;
  tips: Array<{ title: string; text: string }>;
  routeSeasonNote: string;
}

/** 계절별 가이드 문구 */
export function buildSeasonGuideContent(period: PeriodSeason, scope: string): SeasonGuideContent {
  if (!period.seasonActive) {
    return {
      regionSummary: `${scope}은(는) 선택 기간(${period.periodLabel})의 방문·배출 데이터를 반영한 추천입니다. 기간이 여러 해에 걸쳐 계절 특성을 반영하기 어려워, 기간 내 인기·저탄소 기준으로 구성했습니다.`,
      courseNote: "선택 기간 방문·인기 데이터를 반영한 저탄소 코스입니다. 대중교통·도보 연계 시 탄소를 더 줄일 수 있습니다.",
      travelerHint: `선택 기간 ${period.periodLabel}의 방문 패턴을 반영해 추천 순서를 조정합니다.`,
      tips: [
        { title: "대중교통 활용", text: "버스·기차 이용으로 이동 탄소를 줄여요." },
        { title: "로컬 소비", text: "지역 농산물·로컬 가게 이용으로 상생해요." },
      ],
      routeSeasonNote: "",
    };
  }

  const seasonTips: Record<Season, Array<{ title: string; text: string }>> = {
    winter: [
      { title: "실내·온천 연계", text: `${scope} 겨울철에는 실내 문화시설·온천과 짧은 야외 동선을 묶으면 냉난방·이동 탄소를 함께 줄일 수 있어요.` },
      { title: "대중교통 우선", text: "눈·결빙 구간 자가용 운행은 배출뿐 아니라 안전 리스크도 커요. 버스·기차 환승을 우선하세요." },
    ],
    spring: [
      { title: "꽃·산책 코스", text: "벚꽃·진달래 시즌에는 도보·자전거 산책 코스가 자가용 순환 관광보다 탄소 효율이 좋아요." },
      { title: "성수기 분산", text: "주말 꽃축제 집중 방문은 혼잡·이동 배출을 키웁니다. 평일·오전 시간대를 활용해 보세요." },
    ],
    summer: [
      { title: "해안·계곡 접근", text: "해변·계곡은 셔틀·마을버스로 접근하면 주차 순환 차량 탄소를 크게 줄일 수 있어요." },
      { title: "폭염·냉방 절약", text: "야외 체류 후 실내 냉방을 과하게 쓰면 탄소가 늘어요. 그늘·수분 보충과 적정 냉방을 병행하세요." },
    ],
    autumn: [
      { title: "단풍·트레킹", text: "단풍 시즌 산책로는 도보·트레킹 버스 연계가 자가용 산간 도로 운행보다 저탄소예요." },
      { title: "수확·로컬 체험", text: "지역 축제·수확 체험은 로컬 소비와 연계하면 이동·식품 탄소를 함께 줄일 수 있어요." },
    ],
  };

  const tips: Array<{ title: string; text: string }> = [];
  for (const s of period.seasons) {
    tips.push(...(seasonTips[s] ?? []));
  }
  const uniqueTips = tips.slice(0, 4);

  const seasonPhrase = period.label;
  return {
    regionSummary: `${scope}은(는) 선택 기간(${period.periodLabel}, ${seasonPhrase}) 기준으로 방문 패턴을 반영한 추천입니다. ${seasonPhrase}에 어울리는 저탄소 POI·동선을 우선 구성했습니다.`,
    courseNote: `${seasonPhrase} 시즌에 맞춘 저탄소 코스이며, 해당 기간 방문·인기 데이터를 반영했습니다. 대중교통·도보 연계 시 탄소를 더 줄일 수 있습니다.`,
    travelerHint: `선택 기간 ${period.periodLabel}(${seasonPhrase})의 계절 특성과 방문 패턴을 반영해 추천 순서를 조정합니다.`,
    tips: uniqueTips.length ? uniqueTips : [
      { title: "대중교통 활용", text: "버스·기차 이용으로 이동 탄소를 줄여요." },
      { title: "로컬 소비", text: "지역 농산물·로컬 가게 이용으로 상생해요." },
    ],
    routeSeasonNote:
      period.seasons.includes("winter")
        ? "겨울철 구간은 결빙·적설 시 자가용보다 버스·기차 환승이 안전하고 탄소 면에서도 유리합니다."
        : period.seasons.includes("summer")
          ? "여름철 야외·해안 구간은 셔틀·버스로 이동하면 주차 순환 탄소를 줄일 수 있습니다."
          : period.seasons.includes("autumn")
            ? "단풍·축제 시즌 혼잡 구간은 대중교통·도보 환승으로 이동 탄소를 낮출 수 있습니다."
            : "봄철 꽃·산책 코스는 도보·자전거 연계가 자가용 순환보다 저탄소입니다.",
  };
}
