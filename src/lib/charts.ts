import type { EChartsOption, ScatterSeriesOption } from "echarts";
import { fmtEmission, fmtInt, fmtNum, fmtYm } from "./format";

const AXIS_COLOR = "#718096";
const SPLIT_COLOR = "#E6ECF2";
const FONT = "Pretendard, sans-serif";
const DATA_BLUE = "#4B83E5";
const CARBON_PURPLE = "#7A72D8";
const ECO_GREEN = "#2D9B6A";

const baseGrid = { left: 8, right: 16, top: 28, bottom: 8, containLabel: true };

const trendGrid = { left: 8, right: 16, top: 20, bottom: 28, containLabel: true };

/** 월별 추이 (방문자 막대 + 탄소배출 라인, 이중축) */
export function trendOption(
  ymList: string[],
  visitors: number[],
  emission: number[],
): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    grid: trendGrid,
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const arr = params as Array<{ axisValue: string; seriesName: string; value: number; marker: string }>;
        if (!arr.length) return "";
        const head = arr[0].axisValue;
        const lines = arr.map((p) => {
          const val = p.seriesName.includes("배출") ? `${fmtEmission(p.value)} tCO₂e` : `${fmtInt(p.value)} 명`;
          return `${p.marker}${p.seriesName} <b>${val}</b>`;
        });
        return `${head}<br/>${lines.join("<br/>")}`;
      },
    },
    legend: {
      bottom: 0,
      left: "center",
      orient: "horizontal",
      itemGap: 20,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 11, color: "#64748b" },
    },
    xAxis: {
      type: "category",
      data: ymList.map(fmtYm),
      axisLabel: { color: AXIS_COLOR, fontSize: 10, interval: Math.floor(ymList.length / 12) },
      axisLine: { lineStyle: { color: SPLIT_COLOR } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "방문자",
        nameTextStyle: { color: AXIS_COLOR, fontSize: 10 },
        axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: (v: number) => fmtEmission(v) },
        splitLine: { lineStyle: { color: SPLIT_COLOR } },
      },
      {
        type: "value",
        name: "tCO₂e",
        nameTextStyle: { color: AXIS_COLOR, fontSize: 10 },
        axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: (v: number) => fmtEmission(v) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "방문자 수",
        type: "bar",
        data: visitors,
        itemStyle: { color: "rgba(75, 131, 229, 0.35)", borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 14,
      },
      {
        name: "탄소배출량",
        type: "line",
        yAxisIndex: 1,
        data: emission,
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2.5, color: CARBON_PURPLE },
        itemStyle: { color: CARBON_PURPLE },
        areaStyle: { color: "rgba(122, 114, 216, 0.10)" },
      },
    ],
  };
}

/** 단일 라인 추이 */
export function lineOption(
  ymList: string[],
  values: number[],
  name: string,
  color = DATA_BLUE,
  rawX = false,
): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    grid: baseGrid,
    tooltip: { trigger: "axis", valueFormatter: (v) => `${fmtEmission(Number(v))}` },
    xAxis: {
      type: "category",
      data: rawX ? ymList : ymList.map(fmtYm),
      axisLabel: { color: AXIS_COLOR, fontSize: 10, interval: rawX ? 0 : Math.floor(ymList.length / 12) },
      axisLine: { lineStyle: { color: SPLIT_COLOR } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: (v: number) => fmtEmission(v) },
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
    },
    series: [
      {
        name,
        type: "line",
        data: values,
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2.5, color },
        itemStyle: { color },
        areaStyle: { color: "rgba(75, 131, 229, 0.10)" },
      },
    ],
  };
}

/** 도넛 (카테고리 구성비) */
export function donutOption(
  data: Array<{ name: string; value: number; color?: string }>,
  centerLabel?: string,
): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const d = p as { name: string; value: number; percent: number; marker: string };
        return `${d.marker}${d.name}<br/><b>${fmtEmission(d.value)}</b> tCO₂e (${d.percent}%)`;
      },
    },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 0,
      top: "center",
      itemWidth: 9,
      itemHeight: 9,
      textStyle: { fontSize: 11, color: "#718096" },
    },
    series: [
      {
        type: "pie",
        radius: ["52%", "76%"],
        center: ["32%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
        label: centerLabel
          ? { show: true, position: "center", formatter: centerLabel, fontSize: 12, color: "#718096", lineHeight: 16 }
          : { show: false },
        labelLine: { show: false },
        data: data.map((d) => ({ name: d.name, value: d.value, itemStyle: d.color ? { color: d.color } : undefined })),
      },
    ],
  };
}

/** 가로 막대 (대분류별 비교) */
export function hBarOption(
  rows: Array<{ name: string; value: number; color?: string; share?: number }>,
): EChartsOption {
  const cats = rows.map((r) => r.name).reverse();
  const vals = rows.map((r) => ({ value: r.value, itemStyle: { color: r.color ?? DATA_BLUE } })).reverse();
  const shares = rows.map((r) => r.share).reverse();
  return {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 64, top: 10, bottom: 8, containLabel: true },
    tooltip: { trigger: "item", valueFormatter: (v) => `${fmtEmission(Number(v))} tCO₂e` },
    xAxis: { type: "value", axisLabel: { show: false }, splitLine: { lineStyle: { color: SPLIT_COLOR } } },
    yAxis: {
      type: "category",
      data: cats,
      axisLabel: { color: "#14263D", fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: vals,
        barMaxWidth: 16,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right",
          fontSize: 11,
          color: "#718096",
          formatter: (p: any) =>
            `${fmtEmission(p.value)}${shares[p.dataIndex] != null ? `  (${shares[p.dataIndex]}%)` : ""}`,
        },
      },
    ],
  };
}

/** 비교 막대 (선택 POI vs 평균) */
export function compareBarOption(
  labels: string[],
  values: number[],
  colors: string[],
): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 8, top: 30, bottom: 8, containLabel: true },
    tooltip: { trigger: "item", valueFormatter: (v) => `${fmtEmission(Number(v))} tCO₂e` },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: "#14263D", fontSize: 11, interval: 0, lineHeight: 14 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: SPLIT_COLOR } },
    },
    yAxis: { type: "value", axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: (v: number) => fmtEmission(v) }, splitLine: { lineStyle: { color: SPLIT_COLOR } } },
    series: [
      {
        type: "bar",
        data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] } })),
        barMaxWidth: 52,
        label: { show: true, position: "top", fontSize: 12, fontWeight: "bold", color: "#14263D", formatter: (p: any) => fmtEmission(p.value) },
      },
    ],
  };
}

/** 트리맵 (카테고리 비중) */
export function treemapOption(
  data: Array<{ name: string; value: number; color: string }>,
): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    tooltip: { formatter: (p: unknown) => {
      const d = p as { name: string; value: number };
      return `${d.name}<br/><b>${fmtEmission(d.value)}</b> tCO₂e`;
    } },
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        itemStyle: { borderColor: "#fff", borderWidth: 2, gapWidth: 2 },
        label: {
          show: true,
          formatter: (p: any) => `${p.name}`,
          fontSize: 12,
          color: "#fff",
          fontWeight: "bold",
        },
        data: data.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
      },
    ],
  };
}

/** 포지셔닝 산점도 1개 점 (값 배열 인덱스는 SCATTER_DIM 참고) */
export interface PositioningPoint {
  id: string;
  name: string;
  sgg: string;
  lcls: string;
  /** 월평균 방문자 수 */
  visitors: number;
  /** 1인당 배출량 (kgCO₂e) */
  perCapita: number;
  /** 총 배출량 (tCO₂e) */
  emission: number;
}

/** scatter data 배열 내 위치 */
const SCATTER_DIM = { x: 0, y: 1, emission: 2, name: 3, sgg: 4, id: 5, lcls: 6 } as const;

/** 사분면 표시 메타 (라벨·색상). 하단 칩 색상과 동일하게 유지 */
export const QUADRANT_META = {
  hiPopLowPc: { label: "고인기 · 저배출", note: "추천", color: ECO_GREEN },
  loPopLowPc: { label: "저인기 · 저배출", note: "숨은 명소", color: DATA_BLUE },
  hiPopHiPc: { label: "고인기 · 고배출", note: "관리 필요", color: "#E09A3E" },
  loPopHiPc: { label: "저인기 · 고배출", note: "개선 필요", color: "#718096" },
} as const;

export type QuadrantKey = keyof typeof QUADRANT_META;

export function quadrantOf(visitors: number, perCapita: number, medV: number, medPc: number): QuadrantKey {
  const popular = visitors >= medV;
  const lowCarbon = perCapita <= medPc;
  if (popular && lowCarbon) return "hiPopLowPc";
  if (popular) return "hiPopHiPc";
  if (lowCarbon) return "loPopLowPc";
  return "loPopHiPc";
}

/** 산점도 클릭 파라미터에서 POI id 추출 */
export function scatterPointId(params: unknown): string | null {
  const value = (params as { value?: unknown })?.value;
  if (!Array.isArray(value)) return null;
  const id = value[SCATTER_DIM.id];
  return typeof id === "string" && id ? id : null;
}

const NICE_MANTISSA = [1, 2, 5];

/** 1·2·5 × 10ⁿ 형태로 값을 내림/올림 (로그 축 눈금이 깔끔해지도록) */
function niceLog(value: number, direction: "down" | "up"): number {
  const exp = Math.floor(Math.log10(value));
  const mantissa = value / 10 ** exp;
  if (direction === "down") {
    const m = [...NICE_MANTISSA].reverse().find((n) => n <= mantissa + 1e-9) ?? 1;
    return m * 10 ** exp;
  }
  const m = NICE_MANTISSA.find((n) => n >= mantissa - 1e-9);
  return m ? m * 10 ** exp : 10 ** (exp + 1);
}

/** 데이터 범위를 감싸는 로그 축 범위 */
function logExtent(values: number[]): [number, number] {
  const positives = values.filter((v) => v > 0);
  if (!positives.length) return [1, 10];
  return [niceLog(Math.min(...positives), "down"), niceLog(Math.max(...positives), "up")];
}

/** 배출량 규모를 로그로 압축해 버블 반경으로 변환 */
function bubbleSize(emission: number): number {
  return Math.max(7, Math.min(30, 7 + 3.2 * Math.log10(Math.max(emission, 1) + 1)));
}

type MarkAreaItem = NonNullable<NonNullable<ScatterSeriesOption["markArea"]>["data"]>[number];

/** 사분면 배경 영역 데이터 1건 */
function quadrantArea(
  x: [number, number],
  y: [number, number],
  color: string,
  text: string,
  position: "insideTopLeft" | "insideTopRight" | "insideBottomLeft" | "insideBottomRight",
): MarkAreaItem {
  return [
    {
      xAxis: x[0],
      yAxis: y[0],
      itemStyle: { color },
      label: {
        show: true,
        formatter: text,
        position,
        distance: 8,
        color: "#94A3B8",
        fontSize: 10.5,
        fontWeight: 600,
      },
    },
    { xAxis: x[1], yAxis: y[1] },
  ];
}

/**
 * 산점도 (월평균 방문자 vs 1인당 배출량 포지셔닝)
 * - 두 축 모두 로그 스케일: 방문자·1인당 배출량 모두 롱테일 분포라 선형 축에서는 판독 불가
 * - 사분면별 대표 POI만 받아 그리며, 색상은 사분면 기준 (하단 칩과 동일)
 */
export function scatterOption(
  points: PositioningPoint[],
  medianVisitors: number,
  medianPerCapita: number,
): EChartsOption {
  const [xMin, xMax] = logExtent(points.map((p) => p.visitors));
  const [yMin, yMax] = logExtent(points.map((p) => p.perCapita));
  // 로그 축에서 0 이하 좌표는 그릴 수 없으므로 기준선을 축 범위 안으로 제한
  const medX = Math.min(Math.max(medianVisitors, xMin), xMax);
  const medY = Math.min(Math.max(medianPerCapita, yMin), yMax);

  const byQuadrant = new Map<QuadrantKey, Array<Array<number | string>>>();
  for (const p of points) {
    const q = quadrantOf(p.visitors, p.perCapita, medianVisitors, medianPerCapita);
    const bucket = byQuadrant.get(q) ?? [];
    bucket.push([p.visitors, p.perCapita, p.emission, p.name, p.sgg, p.id, p.lcls]);
    byQuadrant.set(q, bucket);
  }

  return {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 20, top: 22, bottom: 40, containLabel: true },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: unknown) => {
        const d = (p as { seriesName: string; value: Array<number | string>; color: string });
        const v = d.value;
        return [
          `<b>${v[SCATTER_DIM.name]}</b> <span style="color:#94A3B8">${v[SCATTER_DIM.sgg]} · ${v[SCATTER_DIM.lcls]}</span>`,
          `월평균 방문자 <b>${fmtInt(Number(v[SCATTER_DIM.x]))}</b> 명`,
          `1인당 배출 <b>${fmtNum(Number(v[SCATTER_DIM.y]), 2)}</b> kgCO₂e`,
          `총 배출량 <b>${fmtEmission(Number(v[SCATTER_DIM.emission]))}</b> tCO₂e`,
          `<span style="color:${d.color}">■</span> ${d.seriesName}`,
          `<span style="color:#A0AEC0;font-size:11px">클릭하면 상세 화면으로 이동</span>`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "log",
      min: xMin,
      max: xMax,
      name: "월평균 방문자 수 (명)",
      nameLocation: "middle",
      nameGap: 26,
      nameTextStyle: { color: AXIS_COLOR, fontSize: 11 },
      axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: (v: number) => fmtEmission(v) },
      axisLine: { lineStyle: { color: SPLIT_COLOR } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
    },
    yAxis: {
      type: "log",
      min: yMin,
      max: yMax,
      name: "1인당 배출 (kgCO₂e)",
      nameLocation: "middle",
      nameRotate: 90,
      nameGap: 42,
      nameTextStyle: { color: AXIS_COLOR, fontSize: 11 },
      axisLabel: {
        color: AXIS_COLOR,
        fontSize: 10,
        formatter: (v: number) => (v >= 1 ? fmtEmission(v) : String(Number(v.toPrecision(2)))),
      },
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0, filterMode: "none", zoomOnMouseWheel: "ctrl", moveOnMouseMove: true },
      { type: "inside", yAxisIndex: 0, filterMode: "none", zoomOnMouseWheel: "ctrl", moveOnMouseMove: true },
    ],
    series: [
      {
        // 사분면 배경·중앙값 기준선 전용 (범례에 노출되지 않음)
        name: "__guide",
        type: "scatter",
        data: [],
        silent: true,
        tooltip: { show: false },
        markArea: {
          silent: true,
          data: [
            quadrantArea([xMin, medX], [medY, yMax], "rgba(113,128,150,0.05)", "저인기 · 고배출", "insideTopLeft"),
            quadrantArea([medX, xMax], [medY, yMax], "rgba(224,154,62,0.07)", "고인기 · 고배출", "insideTopRight"),
            quadrantArea([xMin, medX], [yMin, medY], "rgba(75,131,229,0.06)", "저인기 · 저배출 (숨은 명소)", "insideBottomLeft"),
            quadrantArea([medX, xMax], [yMin, medY], "rgba(45,155,106,0.10)", "고인기 · 저배출 (추천)", "insideBottomRight"),
          ],
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#C6D2DE", type: "dashed", width: 1 },
          label: { color: "#A0AEC0", fontSize: 10, rotate: 0 },
          data: [
            { xAxis: medX, label: { formatter: "방문 중앙값", position: "insideEndTop" } },
            { yAxis: medY, label: { formatter: "배출 중앙값", position: "insideStartTop" } },
          ],
        },
      },
      ...(Object.keys(QUADRANT_META) as QuadrantKey[]).map((q) => {
        const meta = QUADRANT_META[q];
        return {
          name: `${meta.label} (${meta.note})`,
          type: "scatter" as const,
          data: byQuadrant.get(q) ?? [],
          symbolSize: (val: Array<number | string>) => bubbleSize(Number(val[SCATTER_DIM.emission])),
          itemStyle: {
            color: meta.color,
            opacity: 0.78,
            borderColor: "#ffffff",
            borderWidth: 1,
          },
          label: {
            show: true,
            position: "right" as const,
            distance: 5,
            fontSize: 10,
            color: "#475569",
            formatter: (p: { value: unknown }) =>
              Array.isArray(p.value) ? String(p.value[SCATTER_DIM.name]) : "",
          },
          labelLayout: { hideOverlap: true },
          emphasis: {
            scale: 1.3,
            itemStyle: { opacity: 1, borderColor: "#14263D", borderWidth: 1.2 },
            label: { fontWeight: "bold" as const },
          },
        };
      }),
    ],
  };
}
