/** 대분류(lcls) 표시 색상 — 데이터 의미 기반 통일 팔레트 */
export const LCLS_META: Record<string, { color: string }> = {
  숙박: { color: "#7A72D8" },
  추천코스: { color: "#4B83E5" },
  체험관광: { color: "#5B8DEF" },
  음식: { color: "#E09A3E" },
  역사관광: { color: "#718096" },
  레저스포츠: { color: "#4B83E5" },
  자연관광: { color: "#2D9B6A" },
  쇼핑: { color: "#7A72D8" },
  문화관광: { color: "#0B5A4A" },
};

export function lclsColor(lcls: string): string {
  return LCLS_META[lcls]?.color ?? "#718096";
}

export const CHART_PALETTE = [
  "#4B83E5",
  "#2D9B6A",
  "#7A72D8",
  "#E09A3E",
  "#718096",
  "#0B5A4A",
  "#5B8DEF",
  "#6FD3A7",
  "#3568C9",
];
