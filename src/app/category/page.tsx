"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Cloud,
  Footprints,
  MapPin,
  PieChart,
  Tags,
  TrendingUp,
  Users,
} from "lucide-react";
import { useDataset } from "@/components/DataProvider";
import { AppIcon } from "@/components/icons";
import { PageHeader, Card, Kpi, LoadingState, ErrorState, Select, InsightBlock } from "@/components/ui";
import { EChart } from "@/components/charts/EChart";
import {
  ALL,
  applyFilters,
  groupBy,
  monthlySeries,
  poiEmission,
  type Filters,
  type Nati,
} from "@/lib/aggregate";
import { hBarOption, lineOption, treemapOption } from "@/lib/charts";
import { lclsColor } from "@/lib/categories";
import { fmtEmission, fmtInt, fmtNum } from "@/lib/format";

export default function CategoryPage() {
  const { meta, pois, loading, error, loadMonthly } = useDataset();
  const [sido, setSido] = useState<string>(ALL);
  const [lcls, setLcls] = useState<string>(ALL);
  const [mcls, setMcls] = useState<string>(ALL);
  const [nati, setNati] = useState<Nati>(ALL);
  const [monthly, setMonthly] = useState<Record<string, number[]> | null>(null);

  useEffect(() => { loadMonthly().then(setMonthly); }, [loadMonthly]);

  const view = useMemo(() => {
    if (!meta) return null;
    const regionPois = sido === ALL ? pois : pois.filter((p) => p.sido === sido);
    const selPois = applyFilters(regionPois, { sido, sgg: ALL, lcls, mcls, nati } as Filters);
    const totalRegionE = regionPois.reduce((s, p) => s + poiEmission(p, nati), 0);
    const selE = selPois.reduce((s, p) => s + poiEmission(p, nati), 0);
    const selV = selPois.reduce((s, p) => s + (nati === "현지인" ? p.vL : nati === "외지인" ? p.vO : p.v), 0);
    const lclsGroups = groupBy(regionPois, nati, (p) => p.lcls);
    const mclsGroups = groupBy(regionPois, nati, (p) => p.mcls, (p) => p.mcls);
    return { regionPois, selPois, totalRegionE, selE, selV, lclsGroups, mclsGroups };
  }, [meta, pois, sido, lcls, mcls, nati]);

  const trend = useMemo(() => {
    if (!meta || !monthly || !view) return null;
    const { visitors, emission } = monthlySeries(view.selPois, monthly, meta.nMonths, nati);
    // 연-월 -> 월(1~12) 계절 패턴
    const byMonth = new Array(12).fill(0);
    const cnt = new Array(12).fill(0);
    meta.ymList.forEach((ym, i) => {
      const m = Number(ym.slice(4, 6)) - 1;
      byMonth[m] += emission[i];
      cnt[m] += 1;
    });
    const seasonal = byMonth.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
    // YoY: 최근 12개월 vs 직전 12개월
    const n = emission.length;
    const recent = emission.slice(n - 12).reduce((a, b) => a + b, 0);
    const prev = emission.slice(n - 24, n - 12).reduce((a, b) => a + b, 0);
    const yoy = prev ? ((recent - prev) / prev) * 100 : 0;
    return { seasonal, yoy, visitors };
  }, [meta, monthly, view, nati]);

  if (loading) return (<><PageHeader title="카테고리 분석" /><LoadingState /></>);
  if (error || !meta || !view) return (<><PageHeader title="카테고리 분석" /><ErrorState message={error ?? "오류"} /></>);

  const mclsOptions = lcls === ALL ? [ALL] : [ALL, ...(meta.filters.mclsByLcls[lcls] ?? [])];
  const sharePct = view.totalRegionE ? (view.selE / view.totalRegionE) * 100 : 0;
  const scope = sido === ALL ? "전국" : sido;
  const catLabel = mcls !== ALL ? mcls : lcls !== ALL ? lcls : "전체 카테고리";

  const lclsBars = view.lclsGroups.map((g) => ({
    name: g.label,
    value: g.emission,
    color: lclsColor(g.key),
    share: view.totalRegionE ? Number(((g.emission / view.totalRegionE) * 100).toFixed(1)) : 0,
  }));

  const treemap = view.lclsGroups.map((g) => ({ name: g.label, value: g.emission, color: lclsColor(g.key) }));

  const sortedMcls = [...view.mclsGroups].sort((a, b) => b.emission - a.emission);
  const mclsToLcls = new Map(meta.mclsRollup.map((m) => [m.mcls as string, m.lcls as string]));

  const topCat = view.lclsGroups[0];
  const lowCat = [...view.lclsGroups].sort((a, b) => a.emission - b.emission)[0];

  return (
    <>
      <PageHeader title="카테고리 분석" subtitle="대분류·중분류별 관광 관심지점 탄소배출량 비교" />
      <div className="filterbar">
        <Select label="지역" icon={<AppIcon icon={MapPin} size={14} />} value={sido} options={[ALL, ...meta.filters.sido]} onChange={setSido} />
        <Select label="대분류" icon={<AppIcon icon={Tags} size={14} />} value={lcls} options={[ALL, ...meta.filters.lcls]} onChange={(v) => { setLcls(v); setMcls(ALL); }} />
        <Select label="중분류" icon={<AppIcon icon={PieChart} size={14} />} value={mcls} options={mclsOptions} onChange={setMcls} />
        <Select label="방문객 유형" icon={<AppIcon icon={Users} size={14} />} value={nati} options={meta.filters.nati} onChange={(v) => setNati(v as Nati)} />
        <div style={{ marginLeft: "auto", alignSelf: "flex-end", fontSize: 11, color: "var(--text-faint)" }}>
          {scope} · {catLabel}
        </div>
      </div>

      <div className="content">
        <div className="kpi-row">
          <Kpi variant="purple" icon={<AppIcon icon={Cloud} />} label="선택 카테고리 총 배출량" value={fmtEmission(view.selE)} unit="tCO₂e" sub={catLabel} />
          <Kpi variant="blue" icon={<AppIcon icon={PieChart} />} label="전체 대비 비중" value={fmtNum(sharePct, 1)} unit="%" sub={`${scope} 배출량 대비`} />
          <Kpi variant="blue" icon={<AppIcon icon={Users} />} label="총 방문자 수" value={fmtInt(view.selV)} unit="명" />
          <Kpi variant="amber" icon={<AppIcon icon={MapPin} />} label="POI 수" value={fmtInt(view.selPois.length)} unit="개" />
          <Kpi
            variant={trend && trend.yoy >= 0 ? "red" : "green"}
            icon={<AppIcon icon={TrendingUp} />}
            label="전년 대비 증감률"
            value={trend ? `${trend.yoy >= 0 ? "+" : ""}${fmtNum(trend.yoy, 1)}` : "—"}
            unit="%"
            sub="최근 12개월"
          />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1.1fr" }}>
          <Card title="대분류별 탄소배출량 비교" unit="tCO₂e">
            <EChart option={hBarOption(lclsBars)} height={340} />
          </Card>

          <Card title={`중분류별 탄소배출량 (${sortedMcls.length}개)`} foot="※ 배출량 내림차순">
            <div style={{ maxHeight: 340, overflow: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr><th>순위</th><th>중분류</th><th className="num">방문자</th><th className="num">배출량</th><th className="num">비중</th></tr>
                </thead>
                <tbody>
                  {sortedMcls.map((g, i) => (
                    <tr key={g.key}>
                      <td><span className={`rank ${i < 3 ? `rank--${i + 1}` : ""}`}>{i + 1}</span></td>
                      <td style={{ fontWeight: 600 }}>
                        <span className="legend-dot" style={{ background: lclsColor(mclsToLcls.get(g.key) ?? "") }} />
                        {g.label}
                      </td>
                      <td className="num">{fmtInt(g.visitors)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmtEmission(g.emission)}</td>
                      <td className="num muted">{view.totalRegionE ? fmtNum((g.emission / view.totalRegionE) * 100, 1) : "0"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.2fr 1fr 1fr" }}>
          <Card title="선택 카테고리 월별(계절) 추이" unit="tCO₂e">
            {trend ? (
              <EChart option={lineOption(MONTHS, trend.seasonal, "탄소배출량", "#7A72D8", true)} height={250} />
            ) : (
              <LoadingState label="월별 데이터 로딩 중…" />
            )}
          </Card>

          <Card title="카테고리별 탄소배출량 비중" unit="트리맵">
            <EChart option={treemapOption(treemap)} height={250} />
          </Card>

          <Card title="AI 인사이트 요약">
            <InsightBlock
              icon={<AppIcon icon={ArrowUpRight} size={16} />}
              tone="amber"
              title="고탄소배출 카테고리"
              text={topCat && `'${topCat.label}'(${fmtNum((topCat.emission / view.totalRegionE) * 100, 1)}%)의 배출 비중이 가장 높습니다. 체류·이동 강도가 높은 카테고리입니다.`}
            />
            <InsightBlock
              icon={<AppIcon icon={ArrowDownRight} size={16} />}
              tone="green"
              title="저탄소배출 카테고리"
              text={lowCat && `'${lowCat.label}'(${fmtNum((lowCat.emission / view.totalRegionE) * 100, 1)}%)의 배출 비중이 가장 낮아 저탄소 여행 테마로 적합합니다.`}
            />
            <InsightBlock
              icon={<AppIcon icon={Footprints} size={16} />}
              tone="teal"
              title="여행자에게 주는 의미"
              text="친환경 인증 숙소·대중교통·지역 식당 이용으로 카테고리 탄소발자국을 줄일 수 있습니다."
            />
          </Card>
        </div>
      </div>
    </>
  );
}

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
