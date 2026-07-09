"use client";

import type { ReactNode } from "react";
import type { Meta } from "@/lib/types";
import { ALL, type Filters } from "@/lib/aggregate";
import { Building2, MapPin, Puzzle, Tags, Users } from "lucide-react";
import { AppIcon } from "./icons";
import { Select } from "./ui";

interface Props {
  meta: Meta;
  filters: Filters;
  onChange: (next: Filters) => void;
  show?: Array<"sido" | "sgg" | "lcls" | "mcls" | "nati">;
  children?: ReactNode;
}

export function FilterBar({
  meta,
  filters,
  onChange,
  show = ["sido", "sgg", "lcls", "mcls", "nati"],
  children,
}: Props) {
  const sggOptions =
    filters.sido === ALL
      ? [ALL]
      : [ALL, ...(meta.filters.sggBySido[filters.sido] ?? [])];
  const mclsOptions =
    filters.lcls === ALL
      ? [ALL]
      : [ALL, ...(meta.filters.mclsByLcls[filters.lcls] ?? [])];

  return (
    <div className="filterbar">
      {show.includes("sido") && (
        <Select
          label="시도"
          icon={<AppIcon icon={Building2} size={14} />}
          value={filters.sido}
          options={[ALL, ...meta.filters.sido]}
          onChange={(v) => onChange({ ...filters, sido: v, sgg: ALL })}
        />
      )}
      {show.includes("sgg") && (
        <Select
          label="시군구"
          icon={<AppIcon icon={MapPin} size={14} />}
          value={filters.sgg}
          options={sggOptions}
          onChange={(v) => onChange({ ...filters, sgg: v })}
        />
      )}
      {show.includes("lcls") && (
        <Select
          label="대분류"
          icon={<AppIcon icon={Tags} size={14} />}
          value={filters.lcls}
          options={[ALL, ...meta.filters.lcls]}
          onChange={(v) => onChange({ ...filters, lcls: v, mcls: ALL })}
        />
      )}
      {show.includes("mcls") && (
        <Select
          label="중분류"
          icon={<AppIcon icon={Puzzle} size={14} />}
          value={filters.mcls}
          options={mclsOptions}
          onChange={(v) => onChange({ ...filters, mcls: v })}
        />
      )}
      {show.includes("nati") && (
        <Select
          label="방문객 유형"
          icon={<AppIcon icon={Users} size={14} />}
          value={filters.nati}
          options={meta.filters.nati}
          onChange={(v) => onChange({ ...filters, nati: v as Filters["nati"] })}
        />
      )}
      {children}
      <div style={{ marginLeft: "auto", alignSelf: "flex-end", fontSize: 11, color: "var(--text-faint)" }}>
        기간 {meta.ymMin.slice(0, 4)}.{meta.ymMin.slice(4)} ~ {meta.ymMax.slice(0, 4)}.{meta.ymMax.slice(4)}
      </div>
    </div>
  );
}
