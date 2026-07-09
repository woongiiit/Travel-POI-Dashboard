import { fmtEmission, fmtInt, fmtNum } from "./format";
import type { Group, Aggregates } from "./aggregate";

export interface Insight {
  icon: string;
  title: string;
  text: string;
}

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
