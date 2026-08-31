"use client";

import type { Meta } from "@/lib/types";
import { fmtYmFull } from "@/lib/format";
import { CalendarRange } from "lucide-react";
import { AppIcon } from "./icons";

interface Props {
  meta: Meta;
  ymFrom: string;
  ymTo: string;
  onChange: (ymFrom: string, ymTo: string) => void;
}

export function PeriodRangeField({ meta, ymFrom, ymTo, onChange }: Props) {
  const ymOptions = meta.ymList;
  const from = ymFrom || meta.ymMin;
  const to = ymTo || meta.ymMax;

  const setFrom = (v: string) => {
    const nextTo = ymOptions.indexOf(v) > ymOptions.indexOf(to) ? v : to;
    onChange(v, nextTo);
  };

  const setTo = (v: string) => {
    const nextFrom = ymOptions.indexOf(v) < ymOptions.indexOf(from) ? v : from;
    onChange(nextFrom, v);
  };

  return (
    <div className="field field--period">
      <label>
        <AppIcon icon={CalendarRange} size={14} className="field__icon" />
        기간
      </label>
      <div className="period-range">
        <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작 월">
          {ymOptions.map((ym) => (
            <option key={ym} value={ym}>
              {fmtYmFull(ym)}
            </option>
          ))}
        </select>
        <span className="period-range__sep">~</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="종료 월">
          {ymOptions.map((ym) => (
            <option key={ym} value={ym}>
              {fmtYmFull(ym)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** meta 로드 후 ymFrom/ymTo 초기값이 비어 있으면 전체 기간으로 설정 */
export function initYmRange(
  meta: { ymMin: string; ymMax: string },
  ymFrom: string,
  ymTo: string,
): { ymFrom: string; ymTo: string } {
  return {
    ymFrom: ymFrom || meta.ymMin,
    ymTo: ymTo || meta.ymMax,
  };
}
