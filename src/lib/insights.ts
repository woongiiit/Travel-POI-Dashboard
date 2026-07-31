import { fmtEmission, fmtInt, fmtNum } from "./format";
import type { Group, Aggregates } from "./aggregate";
import type { Poi } from "./types";

export interface Insight {
  icon: string;
  title: string;
  text: string;
}

/** 하단 인사이트 카드용 항목 (기존) */
export function nationalInsights(
  agg: Aggregates,
  lclsGroups: Group[],
  scope: string,
): Insight[] {
  const top = lclsGroups[0];
  const low = [...lclsGroups].sort((a, b) => a.emission - b.emission)[0];
  const out: Insight[] = [];
  out.push({
    icon: "🌍",
    title: "전체 현황",
    text: `${scope} ${fmtInt(agg.count)}개 POI에서 약 ${fmtEmission(agg.totalEmission)} tCO₂e의 탄소가 배출되는 것으로 추정됩니다. 1인당 평균 ${fmtNum(agg.perCapitaKg, 2)} kgCO₂e 수준입니다.`,
  });
  if (top) {
    out.push({
      icon: "🛏️",
      title: "고배출 카테고리",
      text: `'${top.label}' 카테고리의 배출 비중이 가장 높습니다(${fmtEmission(top.emission)} tCO₂e). 체류·이동 강도가 높은 카테고리이므로 저탄소 숙소·이동수단 안내를 고려하세요.`,
    });
  }
  out.push({
    icon: "📊",
    title: "집중도",
    text: `상위 10개 POI가 전체 배출량의 ${fmtNum(agg.top10Share, 1)}%를 차지합니다. 소수 POI에 배출이 집중되어 있어 핵심 지점 관리가 효과적입니다.`,
  });
  if (low) {
    out.push({
      icon: "🌿",
      title: "저탄소 기회",
      text: `'${low.label}' 등 자연·문화 기반 POI는 배출 강도가 낮습니다. 저탄소 추천 ${fmtInt(agg.lowCarbonCount)}개 POI를 활용한 여행 코스를 제안할 수 있습니다.`,
    });
  }
  return out;
}

/** 저탄소 판정 임계값 (1인당 kgCO₂e) — aggregate와 동일 */
const LOW_PC = 1.0;
const CONTENT_COUNT = 10;
const COURSE_COUNT = 3;
const STOPS_PER_COURSE = 3;

export interface LowCarbonPick {
  id: string;
  name: string;
  sido: string;
  sgg: string;
  lcls: string;
  mcls: string;
  perCapita: number;
  monthlyVisitors: number;
}

export interface CourseOption {
  /** 옵션 A/B/C */
  label: string;
  /** 코스 테마명 */
  title: string;
  /** 주 지역 (시도) */
  sido: string;
  /** 경로 노드 (POI명) */
  stops: string[];
  /** "A → B → C" 형태 */
  path: string;
}

export interface NationalAiInsight {
  contents: LowCarbonPick[];
  courses: CourseOption[];
  /** 요약 문장 2줄 */
  intro: string[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const SIDO_SHORT: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원특별자치도: "강원",
  강원도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전북특별자치도: "전북",
  전라북도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
  제주도: "제주",
};

/** 시도 약어 (경남·전북 등). 미등록 시 원문 유지 */
export function shortSido(sido: string): string {
  return SIDO_SHORT[sido] ?? sido;
}

function courseTheme(lclsList: string[]): string {
  const joined = lclsList.join(" ");
  if (/자연/.test(joined)) return "자연·도보";
  if (/역사|문화/.test(joined)) return "문화·역사";
  if (/체험|레저/.test(joined)) return "체험·액티비티";
  if (/쇼핑|음식/.test(joined)) return "미식·쇼핑";
  return "저탄소 연계";
}

/**
 * 전국(필터 무시) 기준 AI 인사이트:
 * - 17개 시도를 아우르는 핵심 저탄소 콘텐츠 10개
 * - 추천 여행 코스 옵션 경로 3개
 * seed가 바뀌면 구성이 달라짐 (세션·다시 뽑기).
 */
export function buildNationalAiInsight(
  pois: Poi[],
  nMonths: number,
  seed: number,
): NationalAiInsight {
  const rand = mulberry32(seed);
  const months = Math.max(nMonths, 1);

  const candidates = pois
    .filter((p) => p.pc <= LOW_PC && p.v > 0)
    .map((p) => ({
      id: p.id,
      name: p.nm,
      sido: p.sido,
      sgg: p.sgg,
      lcls: p.lcls,
      mcls: p.mcls,
      perCapita: p.pc,
      monthlyVisitors: p.v / months,
      score: Math.log10(Math.max(p.v / months, 1)) / Math.max(p.pc, 0.05),
    }));

  // 시도별 상위 후보 (점수 순)
  const bySido = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = bySido.get(c.sido) ?? [];
    list.push(c);
    bySido.set(c.sido, list);
  }
  for (const list of bySido.values()) {
    list.sort((a, b) => b.score - a.score);
  }

  const sidos = shuffleInPlace([...bySido.keys()], rand);
  // 시도 라운드로빈으로 10개 선발 → 지역 편중 완화 + 시드마다 구성 변화
  const picked: LowCarbonPick[] = [];
  const usedIds = new Set<string>();
  let round = 0;
  while (picked.length < CONTENT_COUNT && round < 20) {
    for (const sido of sidos) {
      if (picked.length >= CONTENT_COUNT) break;
      const pool = bySido.get(sido) ?? [];
      // 상위권에서 랜덤 오프셋으로 조금씩 다른 대표 선택
      const offset = Math.floor(rand() * Math.min(5, pool.length));
      const choice = pool.find((p, i) => i >= offset && !usedIds.has(p.id))
        ?? pool.find((p) => !usedIds.has(p.id));
      if (!choice) continue;
      usedIds.add(choice.id);
      picked.push({
        id: choice.id,
        name: choice.name,
        sido: choice.sido,
        sgg: choice.sgg,
        lcls: choice.lcls,
        mcls: choice.mcls,
        perCapita: choice.perCapita,
        monthlyVisitors: choice.monthlyVisitors,
      });
    }
    round += 1;
  }

  // 추천 코스 3: 후보가 많은 시도에서 같은 시도 내 3개 스톱 경로 구성
  const sidoRank = [...bySido.entries()]
    .map(([sido, list]) => ({ sido, list }))
    .filter((x) => x.list.length >= STOPS_PER_COURSE)
    .sort((a, b) => b.list.length - a.list.length);

  shuffleInPlace(sidoRank, rand);
  const courseSidos = sidoRank.slice(0, Math.max(COURSE_COUNT, Math.min(6, sidoRank.length)));
  shuffleInPlace(courseSidos, rand);

  const courses: CourseOption[] = [];
  const courseLabels = ["옵션 A", "옵션 B", "옵션 C"];
  const usedCourseIds = new Set<string>();

  for (let i = 0; i < COURSE_COUNT && i < courseSidos.length; i++) {
    const { sido, list } = courseSidos[i];
    const pool = list.filter((p) => !usedCourseIds.has(p.id));
    // 상위 후보군에서 셔플 후 3개
    const topPool = pool.slice(0, Math.min(12, pool.length));
    shuffleInPlace(topPool, rand);
    const stops = topPool.slice(0, STOPS_PER_COURSE);
    if (stops.length < 2) continue;
    for (const s of stops) usedCourseIds.add(s.id);

    const theme = courseTheme(stops.map((s) => s.lcls));
    courses.push({
      label: courseLabels[i] ?? `옵션 ${i + 1}`,
      title: `${shortSido(sido)} ${theme} 코스`,
      sido,
      stops: stops.map((s) => s.name),
      path: stops.map((s) => s.name).join(" → "),
    });
  }

  const sidoCovered = new Set(picked.map((p) => p.sido)).size;
  const intro = [
    `전국(전체 시도·시군구·분류·방문객) 기준으로 17개 시도 중 ${sidoCovered}개 시도를 아우르는 핵심 저탄소 콘텐츠 ${picked.length}곳을 선정했습니다.`,
    `같은 조건에서 추천 여행 코스 ${courses.length}개 옵션 경로를 구성했습니다. 다시 뽑기마다 구성이 달라집니다.`,
  ];

  return { contents: picked, courses, intro };
}
