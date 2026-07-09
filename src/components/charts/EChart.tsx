"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface Props {
  option: echarts.EChartsOption;
  height?: number | string;
  className?: string;
  onEvents?: Record<string, (params: unknown) => void>;
}

export function EChart({ option, height = 280, className, onEvents }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const eventsRef = useRef(onEvents);
  eventsRef.current = onEvents;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, true);
    chart.off("click");
    const handlers = eventsRef.current;
    if (handlers) {
      for (const [evt, fn] of Object.entries(handlers)) {
        chart.on(evt, fn);
      }
    }
  }, [option]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: "100%", height: typeof height === "number" ? `${height}px` : height }}
    />
  );
}
