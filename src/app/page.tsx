"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  Cloud,
  Leaf,
  Map,
  MapPin,
  PieChart,
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
  groupBy,
  monthlySeries,
  poiEmission,
  poiVisitors,
  type Filters,
} from "@/lib/aggregate";
import { donutOption, trendOption } from "@/lib/charts";
import { lclsColor } from "@/lib/categories";
import { fmtEmission, fmtInt, fmtKorUnit, fmtNum } from "@/lib/format";
import { nationalInsights } from "@/lib/insights";

const INSIGHT_ICONS = [Map, BarChart3, PieChart, Sprout] as const;
const INSIGHT_TONES = ["teal", "purple", "amber", "green"] as const;

export default function HomePage() {
  const router = useRouter();
  const { meta, pois, loading, error, loadMonthly } = useDataset();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [monthly, setMonthly] = useState<Record<string, number[]> | null>(null);

  useEffect(() => {
    loadMonthly().then(setMonthly);
  }, [loadMonthly]);

  const view = useMemo(() => {
    if (!meta) return null;
    const filtered = applyFilters(pois, filters);
    const agg = aggregate(filtered, filters.nati, meta.nMonths);
    const lclsGroups = groupBy(filtered, filters.nati, (p) => p.lcls);
    const sidoGroups = groupBy(filtered, filters.nati, (p) => p.sido);

    const top10 = [...filtered]
      .map((p) => ({
        ...p,
        ev: poiVisitors(p, filters.nati),
        ee: poiEmission(p, filters.nati),
      }))
      .sort((a, b) => b.ee - a.ee)
      .slice(0, 10);

    const points: MapPoint[] = filtered.map((p) => ({
      id: p.id,
      lon: p.lon,
      lat: p.lat,
      name: p.nm,
      sub: `${p.sido} ${p.sgg} · ${p.lcls}`,
      emission: poiEmission(p, filters.nati),
      visitors: poiVisitors(p, filters.nati),
    }));

    return { filtered, agg, lclsGroups, sidoGroups, top10, points };
  }, [meta, pois, filters]);

  const trend = useMemo(() => {
    if (!meta || !monthly || !view) return null;
    return monthlySeries(view.filtered, monthly, meta.nMonths, filters.nati);
  }, [meta, monthly, view, filters.nati]);

  const scopeLabel =
    filters.sido === ALL ? "전국" : filters.sgg === ALL ? filters.sido : `${filters.sido} ${filters.sgg}`;

  if (loading) {
    return (
      <>
        <PageHeader title="전국 POI 현황" subtitle="KT 통신데이터 기반 관광 관심지점(POI) 탄소배출량 대시보드" />
        <LoadingState />
      </>
    );
  }
  if (error || !meta || !view) {
    return (
      <>
        <PageHeader title="전국 POI 현황" />
        <ErrorState message={error ?? "데이터를 불러올 수 없습니다."} />
      </>
    );
  }

  const { agg, lclsGroups, sidoGroups, top10, points } = view;
  const totalEmission = agg.totalEmission;
  const maxE = Math.max(...points.map((p) => p.emission), 1);

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

  return (
    <>
      <PageHeader
        title="전국 POI 현황"
        subtitle="KT 통신데이터 기반 관광 관심지점(POI) 탄소배출량 대시보드"
      />
      <FilterBar meta={meta} filters={filters} onChange={setFilters} />

      <div className="content">
        <div className="kpi-row">
          <Kpi variant="blue" icon={<AppIcon icon={MapPin} />} label="총 POI 수" value={fmtInt(agg.count)} unit="개" sub={`${scopeLabel} 기준`} />
          <Kpi variant="blue" icon={<AppIcon icon={Users} />} label="총 방문자 수" value={fmtKorUnit(agg.totalVisitors)} unit="명" sub="누적 방문자" />
          <Kpi variant="purple" icon={<AppIcon icon={Cloud} />} label="총 탄소배출량" value={fmtEmission(totalEmission)} unit="tCO₂e" sub="추정 배출량" />
          <Kpi variant="green" icon={<AppIcon icon={Leaf} />} label="1인당 평균 배출량" value={fmtNum(agg.perCapitaKg, 2)} unit="kgCO₂e" sub="방문자 1인당" />
          <Kpi variant="amber" icon={<AppIcon icon={PieChart} />} label="상위 10개 POI 비중" value={fmtNum(agg.top10Share, 1)} unit="%" sub="배출 집중도" />
          <Kpi variant="teal" icon={<AppIcon icon={Sprout} />} label="저탄소 추천 POI" value={fmtInt(agg.lowCarbonCount)} unit="개" sub="저배출 카테고리" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.35fr 1.25fr 0.9fr" }}>
          <Card title={`${scopeLabel} POI 분포도`} unit="원 크기=방문자, 색상=배출량">
            <MapView points={points} height={420} maxEmission={maxE} onSelect={handleMapSelect} />
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
              <StatRow icon={<AppIcon icon={Map} size={16} />} label="활성 시도 수" value={`${agg.nSido}개`} />
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
              <EChart option={trendOption(meta.ymList, trend.visitors, trend.emission)} height={250} />
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
                  icon={<AppIcon icon={INSIGHT_ICONS[i] ?? Map} size={16} />}
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
