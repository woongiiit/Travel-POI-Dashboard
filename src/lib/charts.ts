import type { EChartsOption } from "echarts";
import { fmtEmission, fmtInt, fmtYm } from "./format";

const AXIS_COLOR = "#718096";
const SPLIT_COLOR = "#E6ECF2";
const FONT = "Pretendard, sans-serif";
const DATA_BLUE = "#4B83E5";
const CARBON_PURPLE = "#7A72D8";
const ECO_GREEN = "#2D9B6A";

const baseGrid = { left: 8, right: 16, top: 28, bottom: 8, containLabel: true };

/** 월별 추이 (방문자 막대 + 탄소배출 라인, 이중축) */
export function trendOption(
  ymList: string[],
  visitors: number[],
  emission: number[],
): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    grid: baseGrid,
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
    legend: { right: 0, top: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: "#64748b" } },
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

/** 산점도 (방문자 vs 1인당 배출량 포지셔닝) */
export function scatterOption(
  points: Array<{ name: string; visitors: number; perCapita: number; emission: number; color: string }>,
  medianVisitors: number,
  medianPerCapita: number,
): EChartsOption {
  return {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 16, top: 16, bottom: 36, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const d = (p as { data: { name: string; value: number[] } }).data;
        return `<b>${d.name}</b><br/>월평균 방문자 ${fmtInt(d.value[0])}명<br/>1인당 ${d.value[1]} kgCO₂e<br/>총배출 ${fmtEmission(d.value[2])} tCO₂e`;
      },
    },
    xAxis: {
      type: "log",
      name: "월평균 방문자 수 (명)",
      nameLocation: "middle",
      nameGap: 26,
      nameTextStyle: { color: AXIS_COLOR, fontSize: 11 },
      axisLabel: { color: AXIS_COLOR, fontSize: 10, formatter: (v: number) => fmtEmission(v) },
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
    },
    yAxis: {
      type: "value",
      name: "1인당 배출 (kgCO₂e)",
      nameTextStyle: { color: AXIS_COLOR, fontSize: 11 },
      axisLabel: { color: AXIS_COLOR, fontSize: 10 },
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
    },
    series: [
      {
        type: "scatter",
        symbolSize: (val: any) => Math.max(6, Math.min(40, Math.sqrt(val[2]) / 4)),
        itemStyle: { opacity: 0.62 },
        data: points.map((p) => ({
          name: p.name,
          value: [p.visitors, p.perCapita, p.emission],
          itemStyle: { color: p.color },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#D4DEE8", type: "dashed" },
          label: { color: "#A0AEC0", fontSize: 10 },
          data: [
            { xAxis: medianVisitors, label: { formatter: "방문 중앙값" } },
            { yAxis: medianPerCapita, label: { formatter: "배출 중앙값" } },
          ],
        },
      },
    ],
  };
}
