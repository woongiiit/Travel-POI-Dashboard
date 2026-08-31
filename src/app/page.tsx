"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  Cloud,
  Filter,
  Leaf,
  Map as MapIcon,
  MapPin,
  PieChart,
  Shuffle,
  Sparkles,
  Sprout,
  Users,
} from "lucide-react";
import { useDataset } from "@/components/DataProvider";
import { AppIcon } from "@/components/icons";
import { PageHeader, Card, Kpi, LoadingState, ErrorState, StatRow, InsightBlock } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";
import { EChart } from "@/components/charts/EChart";
import { MapView, type MapPoint } from "@/components/MapView";
import {
  ALL,
  aggregate,
  applyFilters,
  defaultFilters,
  defaultFiltersForMeta,
  groupBy,
  isFullYmRange,
  monthlySeries,
  poiScopedMetrics,
  resolveYmRange,
  type Filters,
  type Nati,
} from "@/lib/aggregate";
import { donutOption, trendOption } from "@/lib/charts";
import { lclsColor } from "@/lib/categories";
import { fmtEmission, fmtInt, fmtKorUnit, fmtNum, fmtYmFull } from "@/lib/format";
import { buildNationalAiInsight, nationalInsights, shortSido } from "@/lib/insights";
import type { Poi } from "@/lib/types";

const INSIGHT_ICONS = [MapIcon, BarChart3, PieChart, Sprout] as const;
const INSIGHT_TONES = ["teal", "purple", "amber", "green"] as const;

export default function HomePage() {
  const router = useRouter();
  const { meta, pois, loading, error, loadMonthly } = useDataset();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [monthly, setMonthly] = useState<Record<string, number[]> | null>(null);
  // AI 요약에 실제로 반영된 필터 (상단 필터와 분리 — [필터적용] 시에만 동기화)
  const [aiFilters, setAiFilters] = useState<Filters>(defaultFilters);
  const [aiSeed, setAiSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const reshuffleAi = useCallback(() => setAiSeed(Math.floor(Math.random() * 2 ** 31)), []);
  const applyAiFilters = useCallback(() => {
    setAiFilters(filters);
    setAiSeed(Math.floor(Math.random() * 2 ** 31));
  }, [filters]);

  useEffect(() => {
    loadMonthly().then(setMonthly);
  }, [loadMonthly]);

  useEffect(() => {
    if (!meta) return;
    setFilters((f) => (f.ymFrom && f.ymTo ? f : defaultFiltersForMeta(meta)));
    setAiFilters((f) => (f.ymFrom && f.ymTo ? f : defaultFiltersForMeta(meta)));
  }, [meta]);

  const view = useMemo(() => {
    if (!meta) return null;
    const filtered = applyFilters(pois, filters);
    const ymFrom = filters.ymFrom || meta.ymMin;
    const ymTo = filters.ymTo || meta.ymMax;
    const needsMonthly = !isFullYmRange(meta.ymList, ymFrom, ymTo);
    if (needsMonthly && !monthly) return null;

    const metrics = (p: Poi) =>
      poiScopedMetrics(p, filters.nati, ymFrom, ymTo, meta.ymList, monthly);
    const { nMonths } = resolveYmRange(meta.ymList, ymFrom, ymTo);

    const agg = aggregate(filtered, filters.nati, nMonths, 1.0, metrics);
    const lclsGroups = groupBy(filtered, filters.nati, (p) => p.lcls, undefined, metrics);
    const sidoGroups = groupBy(filtered, filters.nati, (p) => p.sido, undefined, metrics);

    const top10 = [...filtered]
      .map((p) => {
        const m = metrics(p);
        return { ...p, ev: m.visitors, ee: m.emission };
      })
      .sort((a, b) => b.ee - a.ee)
      .slice(0, 10);

    const points: MapPoint[] = filtered.map((p) => {
      const m = metrics(p);
      return {
        id: p.id,
        lon: p.lon,
        lat: p.lat,
        name: p.nm,
        sub: `${p.sido} ${p.sgg} · ${p.lcls}`,
        emission: m.emission,
        visitors: m.visitors,
        radius: Math.min(16, Math.max(5, Math.sqrt(Math.max(m.visitors, 1)) * 0.014)),
      };
    });

    const overviewPoints: MapPoint[] | null =
      filters.sido === ALL
        ? aggregateByRegion(filtered, filters.nati, ymFrom, ymTo, meta.ymList, monthly, "sido")
        : filters.sgg === ALL
          ? aggregateByRegion(filtered, filters.nati, ymFrom, ymTo, meta.ymList, monthly, "sgg")
          : null;

    return { filtered, agg, lclsGroups, sidoGroups, top10, points, overviewPoints };
  }, [meta, pois, filters, monthly]);

  const trend = useMemo(() => {
    if (!meta || !monthly || !view) return null;
    const ymFrom = filters.ymFrom || meta.ymMin;
    const ymTo = filters.ymTo || meta.ymMax;
    const { from, to } = resolveYmRange(meta.ymList, ymFrom, ymTo);
    return monthlySeries(view.filtered, monthly, meta.nMonths, filters.nati, from, to);
  }, [meta, monthly, view, filters.nati, filters.ymFrom, filters.ymTo]);

  const trendYmList = useMemo(() => {
    if (!meta) return [];
    const ymFrom = filters.ymFrom || meta.ymMin;
    const ymTo = filters.ymTo || meta.ymMax;
    const { from, to } = resolveYmRange(meta.ymList, ymFrom, ymTo);
    return meta.ymList.slice(from, to + 1);
  }, [meta, filters.ymFrom, filters.ymTo]);

  const aiScopeLabel = useMemo(
    () => (meta ? formatAiScope(aiFilters, meta.ymList) : ""),
    [aiFilters, meta],
  );

  const aiInsight = useMemo(() => {
    if (!meta) return null;
    const pool = applyFilters(pois, aiFilters);
    return buildNationalAiInsight(pool, meta.nMonths, aiSeed, aiScopeLabel);
  }, [meta, pois, aiFilters, aiSeed, aiScopeLabel]);

  const scopeLabel =
    filters.sido === ALL ? "전국" : filters.sgg === ALL ? filters.sido : `${filters.sido} ${filters.sgg}`;

  /** 시도·시군구 필터에 맞춰 지도 카메라 (카테고리 필터는 카메라에 영향 없음) */
  const mapBounds = useMemo(() => {
    if (filters.sido === ALL) return null;
    const region = pois.filter(
      (p) =>
        p.sido === filters.sido &&
        (filters.sgg === ALL || p.sgg === filters.sgg) &&
        Number.isFinite(p.lon) &&
        Number.isFinite(p.lat),
    );
    return boundsFromPoints(region);
  }, [pois, filters.sido, filters.sgg]);

  const mapFitMaxZoom = filters.sgg !== ALL ? 12 : 9;

  if (loading) {
    return (
      <>
        <PageHeader title="전국 POI 현황" subtitle="KT 통신데이터 기반 관광 관심지점(POI) 탄소배출량 대시보드" />
        <LoadingState />
      </>
    );
  }
  if (error || !meta) {
    return (
      <>
        <PageHeader title="전국 POI 현황" />
        <ErrorState message={error ?? "데이터를 불러올 수 없습니다."} />
      </>
    );
  }
  if (!view) {
    return (
      <>
        <PageHeader
          title="전국 POI 현황"
          subtitle="KT 통신데이터 기반 관광 관심지점(POI) 탄소배출량 대시보드"
        />
        <FilterBar
          meta={meta}
          filters={filters}
          onChange={setFilters}
          show={["sido", "sgg", "lcls", "mcls", "period"]}
        />
        <LoadingState label="월별 데이터 로딩 중…" />
      </>
    );
  }

  const { agg, lclsGroups, sidoGroups, top10, points, overviewPoints } = view;
  const totalEmission = agg.totalEmission;
  const maxE = Math.max(
    1,
    ...(overviewPoints ?? points).map((p) => p.emission),
  );

  const donut = donutOption(
    lclsGroups.map((g) => ({ name: g.label, value: g.emission, color: lclsColor(g.key) })),
    `${fmtEmission(totalEmission)}\ntCO₂e`,
  );

  const insights = nationalInsights(agg, lclsGroups, scopeLabel);

  const handleMapSelect = (id: string) => {
    const poi = pois.find((p) => p.id === id);
    if (!poi) return;
    const params = new URLSearchParams({ poi: id, sido: poi.sido, sgg: poi.sgg });
    router.push(`/region?${params.toString()}`);
  };

  const handleOverviewSelect = (id: string) => {
    setFilters((f) => {
      // 전국 요약 원 클릭 → 해당 시도
      if (f.sido === ALL) return { ...f, sido: id, sgg: ALL };
      // 시도 요약(시군구 원) 클릭 → 해당 시군구
      return { ...f, sgg: id };
    });
  };

  return (
    <>
      <PageHeader
        title="전국 POI 현황"
        subtitle="KT 통신데이터 기반 관광 관심지점(POI) 탄소배출량 대시보드"
      />
      <FilterBar
        meta={meta}
        filters={filters}
        onChange={setFilters}
        show={["sido", "sgg", "lcls", "mcls", "period"]}
      />

      <div className="content">
        <section className="ai-summary" aria-label="AI 인사이트 요약">
          <div className="ai-summary__head">
            <span className="ai-summary__icon">
              <AppIcon icon={Sparkles} size={16} />
            </span>
            <h2 className="ai-summary__title">AI 인사이트 요약</h2>
            <span className="ai-summary__scope">{aiScopeLabel}</span>
            <button type="button" className="quad-shuffle" onClick={reshuffleAi}>
              <AppIcon icon={Shuffle} size={12} />
              다시 뽑기
            </button>
            <button type="button" className="ai-filter-apply" onClick={applyAiFilters}>
              <AppIcon icon={Filter} size={12} />
              필터적용
            </button>
          </div>
          {aiInsight && (
            <div className="ai-summary__body">
              {aiInsight.intro.map((line, i) => (
                <p key={i}>{line}</p>
              ))}

              <div className="ai-summary__block">
                <h3 className="ai-summary__subtitle">핵심 저탄소 콘텐츠 {aiInsight.contents.length}</h3>
                <ol className="ai-summary__list">
                  {aiInsight.contents.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="ai-summary__poi"
                        onClick={() => handleMapSelect(c.id)}
                        title={`${c.sido} ${c.sgg} · 1인당 ${fmtNum(c.perCapita, 2)} kgCO₂e`}
                      >
                        <span className="ai-summary__poi-region">{shortSido(c.sido)}</span>
                        <span className="ai-summary__poi-name">{c.name}</span>
                        <span className="ai-summary__poi-meta">{c.mcls} · {fmtNum(c.perCapita, 2)}kg</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="ai-summary__block">
                <h3 className="ai-summary__subtitle">추천 여행 코스 {aiInsight.courses.length} 옵션</h3>
                <ul className="ai-summary__courses">
                  {aiInsight.courses.map((course) => (
                    <li key={course.label}>
                      <span className="ai-summary__course-label">{course.label}</span>
                      <div className="ai-summary__course-body">
                        <strong>{course.title}</strong>
                        <span className="ai-summary__course-path">{course.path}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <div className="kpi-row">
          <Kpi variant="blue" icon={<AppIcon icon={MapPin} />} label="총 POI 수" value={fmtInt(agg.count)} unit="개" sub={`${scopeLabel} 기준`} />
          <Kpi variant="blue" icon={<AppIcon icon={Users} />} label="총 방문자 수" value={fmtKorUnit(agg.totalVisitors)} unit="명" sub="누적 방문자" />
          <Kpi variant="purple" icon={<AppIcon icon={Cloud} />} label="총 탄소배출량" value={fmtEmission(totalEmission)} unit="tCO₂e" sub="추정 배출량" />
          <Kpi variant="green" icon={<AppIcon icon={Leaf} />} label="1인당 평균 배출량" value={fmtNum(agg.perCapitaKg, 2)} unit="kgCO₂e" sub="방문자 1인당" />
          <Kpi variant="amber" icon={<AppIcon icon={PieChart} />} label="상위 10개 POI 비중" value={fmtNum(agg.top10Share, 1)} unit="%" sub="배출 집중도" />
          <Kpi variant="teal" icon={<AppIcon icon={Sprout} />} label="저탄소 추천 POI" value={fmtInt(agg.lowCarbonCount)} unit="개" sub="저배출 카테고리" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.35fr 1.25fr 0.9fr" }}>
          <Card
            title={`${scopeLabel} POI 분포도`}
            unit={
              filters.sido === ALL
                ? "시도 요약 · 클릭 시 해당 시도로 이동"
                : overviewPoints
                  ? "시군구 요약 · 클릭 시 해당 시군구로 이동"
                  : "원 크기=방문자, 색상=배출량"
            }
          >
            <MapView
              points={points}
              overviewPoints={overviewPoints}
              height={420}
              maxEmission={maxE}
              bounds={mapBounds}
              fitMaxZoom={mapFitMaxZoom}
              fitMinZoom={filters.sgg !== ALL ? 9.5 : 7}
              center={[127.8, 36.2]}
              zoom={5.7}
              onSelect={handleMapSelect}
              onOverviewSelect={handleOverviewSelect}
            />
          </Card>

          <Card title="탄소배출량 Top 10 POI" foot="※ 선택한 필터 기준으로 집계됩니다.">
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>POI명</th>
                    <th>시군구</th>
                    <th className="num">방문자</th>
                    <th className="num">배출량</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((p, i) => (
                    <tr key={p.id}>
                      <td><span className={`rank rank--${i + 1}`}>{i + 1}</span></td>
                      <td style={{ fontWeight: 600 }}>{p.nm}</td>
                      <td className="muted">{p.sgg}</td>
                      <td className="num">{fmtInt(p.ev)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmtEmission(p.ee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={`${scopeLabel} 상황 집계`}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <StatRow icon={<AppIcon icon={MapIcon} size={16} />} label="활성 시도 수" value={`${agg.nSido}개`} />
              <StatRow icon={<AppIcon icon={Building2} size={16} />} label="활성 시군구 수" value={`${agg.nSgg}개`} />
              <StatRow icon={<AppIcon icon={MapPin} size={16} />} label="활성 POI 수" value={`${fmtInt(agg.count)}개`} />
              <StatRow icon={<AppIcon icon={Users} size={16} />} label="총 방문자 수" value={`${fmtKorUnit(agg.totalVisitors)}명`} />
              <StatRow icon={<AppIcon icon={Cloud} size={16} />} label="총 탄소배출량" value={`${fmtEmission(totalEmission)} tCO₂e`} />
              <StatRow icon={<AppIcon icon={Leaf} size={16} />} label="1인당 평균 배출량" value={`${fmtNum(agg.perCapitaKg, 2)} kgCO₂e`} />
              <StatRow icon={<AppIcon icon={PieChart} size={16} />} label="상위 10개 POI 비중" value={`${fmtNum(agg.top10Share, 1)}%`} />
              <StatRow icon={<AppIcon icon={Sprout} size={16} />} label="저탄소 추천 POI 수" value={`${fmtInt(agg.lowCarbonCount)}개`} last />
            </div>
          </Card>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.3fr 1fr 1fr" }}>
          <Card title="월별 탄소배출량 추이" unit="방문자 / tCO₂e">
            {trend ? (
              <EChart option={trendOption(trendYmList, trend.visitors, trend.emission)} height={250} />
            ) : (
              <LoadingState label="월별 데이터 로딩 중…" />
            )}
          </Card>

          <Card title="카테고리별 탄소배출량 구성비" unit="대분류">
            <EChart option={donut} height={250} />
          </Card>

          <Card title="AI 한줄 요약 / 인사이트">
            <div>
              {insights.map((ins, i) => (
                <InsightBlock
                  key={i}
                  icon={<AppIcon icon={INSIGHT_ICONS[i] ?? MapIcon} size={16} />}
                  tone={INSIGHT_TONES[i] ?? "teal"}
                  title={ins.title}
                  text={ins.text}
                />
              ))}
              <div style={{ marginTop: 8 }}>
                <Link href="/discover" className="badge badge--teal">저탄소 콘텐츠 발굴 보기 →</Link>
              </div>
            </div>
          </Card>
        </div>

        <Card title="시도별 탄소배출량" unit="tCO₂e">
          <SidoBars groups={sidoGroups} />
        </Card>
      </div>
    </>
  );
}

function aggregateByRegion(
  filtered: Poi[],
  nati: Nati,
  ymFrom: string,
  ymTo: string,
  ymList: string[],
  monthly: Record<string, number[]> | null,
  level: "sido" | "sgg",
): MapPoint[] {
  type Acc = { lon: number; lat: number; emission: number; visitors: number; count: number; label: string };
  const buckets = new Map<string, Acc>();

  for (const p of filtered) {
    if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
    const key = level === "sido" ? p.sido : p.sgg;
    const { visitors, emission } = poiScopedMetrics(p, nati, ymFrom, ymTo, ymList, monthly);
    const cur = buckets.get(key);
    if (!cur) {
      buckets.set(key, {
        lon: p.lon,
        lat: p.lat,
        emission,
        visitors,
        count: 1,
        label: level === "sido" ? shortSido(p.sido) : p.sgg,
      });
    } else {
      const n = cur.count + 1;
      cur.lon = (cur.lon * cur.count + p.lon) / n;
      cur.lat = (cur.lat * cur.count + p.lat) / n;
      cur.emission += emission;
      cur.visitors += visitors;
      cur.count = n;
    }
  }

  return [...buckets.entries()].map(([id, a]) => ({
    id,
    lon: a.lon,
    lat: a.lat,
    name: a.label,
    sub: level === "sido" ? `${id} · POI ${a.count}곳` : `POI ${a.count}곳`,
    emission: a.emission,
    visitors: a.visitors,
    count: a.count,
    // 시군구 단위는 원이 조금 더 작아도 구분됨
    radius:
      level === "sido"
        ? Math.min(30, Math.max(12, 10 + Math.sqrt(a.count) * 1.05))
        : Math.min(24, Math.max(10, 9 + Math.sqrt(a.count) * 1.15)),
  }));
}

function boundsFromPoints(
  points: { lon: number; lat: number }[],
): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    minLon = Math.min(minLon, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLon = Math.max(maxLon, p.lon);
    maxLat = Math.max(maxLat, p.lat);
  }
  // 포인트 1개·동일 좌표일 때 최소 범위 확보
  const padLon = Math.max((maxLon - minLon) * 0.12, 0.04);
  const padLat = Math.max((maxLat - minLat) * 0.12, 0.04);
  return [
    [minLon - padLon, minLat - padLat],
    [maxLon + padLon, maxLat + padLat],
  ];
}

function formatAiScope(f: Filters, ymList: string[]): string {
  const parts: string[] = [];
  if (f.ymFrom && f.ymTo && !isFullYmRange(ymList, f.ymFrom, f.ymTo)) {
    parts.push(`${fmtYmFull(f.ymFrom)}~${fmtYmFull(f.ymTo)}`);
  }
  if (f.sido === ALL) parts.push("전국");
  else if (f.sgg === ALL) parts.push(f.sido);
  else parts.push(`${f.sido} ${f.sgg}`);
  if (f.lcls !== ALL) parts.push(f.lcls);
  if (f.mcls !== ALL) parts.push(f.mcls);
  if (parts.length === 1 && parts[0] === "전국") return "전국 · 전체 조건";
  return parts.join(" · ");
}

function SidoBars({ groups }: { groups: { label: string; emission: number }[] }) {
  const max = Math.max(...groups.map((g) => g.emission), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groups.map((g) => (
        <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 96, fontSize: 12, color: "var(--text-muted)" }}>{g.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(g.emission / max) * 100}%` }} />
          </div>
          <span style={{ width: 90, textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
            {fmtEmission(g.emission)}
          </span>
        </div>
      ))}
    </div>
  );
}
