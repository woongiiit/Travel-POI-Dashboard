"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Bus,
  Compass,
  Footprints,
  Globe2,
  Hotel,
  MapPin,
  ShoppingBasket,
  Sparkles,
  Tags,
  TrendingDown,
  Users,
} from "lucide-react";
import { useDataset } from "@/components/DataProvider";
import { AppIcon } from "@/components/icons";
import { PeriodRangeField } from "@/components/PeriodRangeField";
import { PageHeader, Card, Kpi, LoadingState, ErrorState, Select, InsightBlock } from "@/components/ui";
import { EChart } from "@/components/charts/EChart";
import { PoiPhoto } from "@/components/PoiPhoto";
import { ALL, groupBy, isFullYmRange, poiScopedMetrics, resolveYmRange } from "@/lib/aggregate";
import { donutOption } from "@/lib/charts";
import { lclsColor } from "@/lib/categories";
import { fmtInt, fmtNum } from "@/lib/format";
import { buildRegionGuideAdvice } from "@/lib/guide-advice";
import {
  analyzePeriodSeason,
  buildSeasonGuideContent,
  poiSeasonalWeight,
} from "@/lib/season";

const LEVELS = ["매우높음", "높음", "보통", "낮음", "매우낮음"];

/** 여행자 유형별 대분류 가중치 — 추천 점수에 곱해짐 */
const TRAVELER_LCLS_WEIGHT: Record<string, Record<string, number>> = {
  "가족 여행": { 자연관광: 1.45, 체험관광: 1.35, 문화관광: 1.1, 레저스포츠: 1.15, 역사관광: 1.05 },
  "커플 여행": { 문화관광: 1.35, 자연관광: 1.3, 음식: 1.25, 쇼핑: 1.1, 역사관광: 1.15 },
  "나홀로 여행": { 문화관광: 1.3, 역사관광: 1.35, 자연관광: 1.25, 체험관광: 1.1 },
  "친구 여행": { 레저스포츠: 1.4, 체험관광: 1.35, 음식: 1.2, 쇼핑: 1.15, 자연관광: 1.1 },
  "시니어 여행": { 역사관광: 1.4, 문화관광: 1.3, 자연관광: 1.25, 음식: 1.1 },
};

export default function GuidePage() {
  const { meta, pois, loading, error, loadMonthly } = useDataset();
  const [sido, setSido] = useState("");
  const [sgg, setSgg] = useState(ALL);
  const [travelerType, setTravelerType] = useState("가족 여행");
  const [monthly, setMonthly] = useState<Record<string, number[]> | null>(null);
  const [ymFrom, setYmFrom] = useState("");
  const [ymTo, setYmTo] = useState("");

  useEffect(() => { loadMonthly().then(setMonthly); }, [loadMonthly]);

  useEffect(() => {
    if (meta && !sido) setSido(meta.filters.sido[0] ?? "");
  }, [meta, sido]);

  useEffect(() => {
    if (!meta || (ymFrom && ymTo)) return;
    setYmFrom(meta.ymMin);
    setYmTo(meta.ymMax);
  }, [meta, ymFrom, ymTo]);

  const ymFromR = ymFrom || meta?.ymMin || "";
  const ymToR = ymTo || meta?.ymMax || "";
  const periodReady = !meta || isFullYmRange(meta.ymList, ymFromR, ymToR) || !!monthly;

  const nationalPc = meta?.kpis.perCapitaKg ?? 1;

  const data = useMemo(() => {
    if (!meta || !sido || !periodReady) return null;
    const metrics = (p: Parameters<typeof poiScopedMetrics>[0]) =>
      poiScopedMetrics(p, ALL, ymFromR, ymToR, meta.ymList, monthly);
    const { from, to, nMonths: periodMonths } = resolveYmRange(meta.ymList, ymFromR, ymToR);
    const periodSeason = analyzePeriodSeason(meta.ymList, ymFromR, ymToR);
    const seasonContent = buildSeasonGuideContent(periodSeason, sgg === ALL ? sido : `${sido} ${sgg}`);
    const regionPois = pois.filter((p) => p.sido === sido && (sgg === ALL || p.sgg === sgg));
    if (!regionPois.length) return { regionPois, empty: true } as const;
    const totV = regionPois.reduce((s, p) => s + metrics(p).visitors, 0);
    const totO = regionPois.reduce((s, p) => {
      const m = metrics(p);
      const outRatio = p.v ? p.vO / p.v : 0;
      return s + m.visitors * outRatio;
    }, 0);
    const totE = regionPois.reduce((s, p) => s + metrics(p).emission, 0);
    const regionPc = totV ? (totE * 1000) / totV : 0;
    const ratio = nationalPc ? regionPc / nationalPc : 1;
    const levelIdx = ratio >= 1.3 ? 0 : ratio >= 1.1 ? 1 : ratio >= 0.9 ? 2 : ratio >= 0.7 ? 3 : 4;

    const lclsGroups = groupBy(regionPois, ALL, (p) => p.lcls, undefined, metrics);
    const medPc = regionPois.map((p) => p.pc).sort((a, b) => a - b)[Math.floor(regionPois.length / 2)] ?? 1;

    const weights = TRAVELER_LCLS_WEIGHT[travelerType] ?? {};
    const scored = regionPois
      .map((p) => {
        const m = metrics(p);
        const base = (medPc / Math.max(p.pc, 0.05)) * Math.log10(Math.max(m.visitors / periodMonths, 1));
        const w = weights[p.lcls] ?? 1;
        const seasonW = poiSeasonalWeight(p, periodSeason, monthly, meta.ymList, from, to);
        return { p, score: base * w * seasonW };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);

    const course = scored.filter((p) => p.pc <= medPc).slice(0, 4);
    const courseIds = new Set(course.map((p) => p.id));
    const similar = scored.filter((p) => p.pc <= medPc && !courseIds.has(p.id)).slice(0, 4);
    const rep = course[0] ?? scored[0];

    return {
      regionPois, totV, totO, totE, regionPc, ratio, levelIdx, lclsGroups, course, similar, rep,
      periodSeason, seasonContent, empty: false,
    };
  }, [meta, pois, sido, sgg, nationalPc, travelerType, ymFromR, ymToR, monthly, periodReady]);

  if (loading) return (<><PageHeader title="AI 여행자 가이드" /><LoadingState /></>);
  if (error || !meta) return (<><PageHeader title="AI 여행자 가이드" /><ErrorState message={error ?? "오류"} /></>);
  if (!periodReady) return (<><PageHeader title="AI 여행자 가이드" /><LoadingState label="월별 데이터 로딩 중…" /></>);

  const sggOptions = sido ? [ALL, ...(meta.filters.sggBySido[sido] ?? [])] : [ALL];
  const scope = sgg === ALL ? sido : `${sido} ${sgg}`;

  if (!data || data.empty) {
    return (
      <>
        <PageHeader title="AI 여행자 가이드" subtitle="선택 지역·POI 기반 맞춤형 탄소중립 여행 제안" />
        <Filters meta={meta} sido={sido} sgg={sgg} sggOptions={sggOptions} travelerType={travelerType}
          ymFrom={ymFrom} ymTo={ymTo}
          onSido={(v) => { setSido(v); setSgg(ALL); }} onSgg={setSgg} onType={setTravelerType}
          onPeriod={(f, t) => { setYmFrom(f); setYmTo(t); }} />
        <div className="content"><LoadingState label="해당 지역 데이터가 없습니다." /></div>
      </>
    );
  }

  const donut = donutOption(
    data.lclsGroups.map((g) => ({ name: g.label, value: g.emission, color: lclsColor(g.key) })),
    `${fmtNum(data.regionPc, 2)}\nkgCO₂e/인`,
  );

  const regionAdvice = buildRegionGuideAdvice({
    course: data.course,
    sido,
    travelerType,
    period: data.periodSeason,
    routeSeasonNote: data.seasonContent.routeSeasonNote,
  });

  return (
    <>
      <PageHeader title="AI 여행자 가이드" subtitle="선택 지역 기반 맞춤형 탄소중립 여행 제안"
        right={<span className="pill pill--teal"><AppIcon icon={Sparkles} size={14} /> AI 추천</span>} />
      <Filters meta={meta} sido={sido} sgg={sgg} sggOptions={sggOptions} travelerType={travelerType}
        ymFrom={ymFrom} ymTo={ymTo}
        onSido={(v) => { setSido(v); setSgg(ALL); }} onSgg={setSgg} onType={setTravelerType}
        onPeriod={(f, t) => { setYmFrom(f); setYmTo(t); }} />

      <div className="content">
        <div className="traveler-hint">
          <AppIcon icon={Users} size={14} />
          <span>
            <b>{travelerType}</b> — {data.seasonContent.travelerHint}
            {" "}추천 코스·유사 POI·대표 POI에 반영됩니다.
          </span>
        </div>

        <div className="kpi-row">
          <Kpi
            variant={data.levelIdx >= 3 ? "green" : data.levelIdx <= 1 ? "red" : "amber"}
            icon={<AppIcon icon={Globe2} />}
            label="선택 지역 탄소수준"
            value={LEVELS[data.levelIdx]}
            sub={`전국 평균 대비 ${data.ratio >= 1 ? "+" : ""}${fmtNum((data.ratio - 1) * 100, 0)}%`}
          />
          <Kpi variant="teal" icon={<AppIcon icon={Tags} />} label="대표 저탄소 POI"
            value={<span style={{ fontSize: 16 }}>{data.rep.nm}</span>} sub={`1인당 ${fmtNum(data.rep.pc, 2)} kgCO₂e`} />
            <Kpi variant="blue" icon={<AppIcon icon={Compass} />} label="추천 저탄소 코스 수" value={data.course.length} unit="개" sub={data.periodSeason.seasonActive ? `${data.periodSeason.label} · ${travelerType}` : `${travelerType} 맞춤`} />
          <Kpi variant="green" icon={<AppIcon icon={TrendingDown} />} label="저탄소 POI 비중"
            value={fmtNum((data.regionPois.filter((p) => p.pc <= 1).length / data.regionPois.length) * 100, 0)} unit="%"
            sub={`${fmtInt(data.regionPois.length)}개 중`} />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <Card title="① 지역 종합 평가">
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 0 }}>
              {data.seasonContent.regionSummary}
            </p>
            <div style={{ height: 180 }}>
              <EChart option={donut} height={180} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", background: "var(--teal-soft)", borderRadius: 8, padding: "8px 10px", border: "1px solid rgba(11,90,74,0.1)" }}>
              {data.lclsGroups[0]?.label} 카테고리의 배출 비중이 높습니다. 친환경 선택으로 줄일 수 있어요.
            </div>
          </Card>

          <Card title="② 여행자 관점 탄소중립 가이드" unit={data.periodSeason.periodLabel}>
            {data.periodSeason.seasonActive && data.seasonContent.tips.map((g) => (
              <InsightBlock key={g.title} icon={<AppIcon icon={Bus} size={16} />} tone="teal" title={g.title} text={g.text} />
            ))}
            {GUIDE_TIPS.map((g) => (
              <InsightBlock key={g.title} icon={<AppIcon icon={g.icon} size={16} />} tone={g.tone} title={g.title} text={g.text} />
            ))}
          </Card>

            <Card title="③ 추천 코스 / 대체 POI" foot={data.periodSeason.seasonActive ? `※ ${data.periodSeason.label} 시즌 · ${travelerType} · 저탄소 POI 중심` : `※ ${travelerType} · 저탄소 POI 중심 · 선택 기간 반영`}>
            <div style={{ position: "relative", paddingLeft: 8 }}>
              {data.course.map((p, i) => (
                <div key={p.id} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--teal)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                    {i < data.course.length - 1 && <span style={{ width: 2, flex: 1, background: "var(--border)", minHeight: 18 }} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nm}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {p.mcls} · 1인당 <b style={{ color: "var(--green)" }}>{fmtNum(p.pc, 2)}</b> kgCO₂e
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--green-soft)", borderRadius: 8, padding: "8px 10px", fontSize: 11.5, color: "var(--green)", border: "1px solid rgba(45,155,106,0.15)" }}>
              {data.seasonContent.courseNote}
            </div>
          </Card>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1.6fr" }}>
          <Card title="④ 주의 포인트 및 동선 제안" foot={regionAdvice.routePath ? `※ 추천 코스 기준: ${regionAdvice.routePath}` : undefined}>
            <div style={{ background: "var(--amber-soft)", border: "1px solid rgba(224,154,62,0.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--amber)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <AppIcon icon={AlertTriangle} size={14} /> 주의 포인트
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
                {regionAdvice.cautions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div style={{ background: "var(--teal-soft)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(11,90,74,0.1)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--teal)", marginBottom: 6, letterSpacing: "0.02em" }}>
                추천 저탄소 동선
              </div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--teal)", lineHeight: 1.65 }}>
                {regionAdvice.suggestionLines.map((line, i) => (
                  <div key={line} style={{ marginBottom: i < regionAdvice.suggestionLines.length - 1 ? 4 : 0 }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="비슷한 취향의 다른 저탄소 POI" unit={data.periodSeason.seasonActive ? `${data.periodSeason.label} · ${travelerType}` : travelerType}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {data.similar.map((p) => (
                <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--panel)" }}>
                  <PoiPhoto id={p.id} alt={p.nm} height={92} fallbackIcon={<AppIcon icon={Tags} size={24} style={{ color: lclsColor(p.lcls) }} />} />
                  <div style={{ padding: "8px 10px" }}>
                    <span className="badge badge--green">저탄소</span>
                    <div style={{ fontWeight: 700, fontSize: 12.5, margin: "4px 0 2px" }}>{p.nm}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtNum(p.pc, 2)} kgCO₂e/인</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 4 }}>
                      <AppIcon icon={MapPin} size={12} /> {p.sgg}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {data.rep && data.similar.length === 0 && <div className="insight__text">유사 저탄소 POI가 충분하지 않습니다.</div>}
          </Card>
        </div>
      </div>
    </>
  );
}

function Filters({
  meta, sido, sgg, sggOptions, travelerType, ymFrom, ymTo,
  onSido, onSgg, onType, onPeriod,
}: {
  meta: NonNullable<ReturnType<typeof useDataset>["meta"]>;
  sido: string; sgg: string; sggOptions: string[]; travelerType: string;
  ymFrom: string; ymTo: string;
  onSido: (v: string) => void; onSgg: (v: string) => void; onType: (v: string) => void;
  onPeriod: (ymFrom: string, ymTo: string) => void;
}) {
  return (
    <div className="filterbar">
      <Select label="시도" icon={<AppIcon icon={Building2} size={14} />} value={sido} options={meta.filters.sido} onChange={onSido} />
      <Select label="시군구" icon={<AppIcon icon={MapPin} size={14} />} value={sgg} options={sggOptions} onChange={onSgg} />
      <Select label="여행자 유형" icon={<AppIcon icon={Users} size={14} />} value={travelerType}
        options={["가족 여행", "커플 여행", "나홀로 여행", "친구 여행", "시니어 여행"]} onChange={onType} />
      <PeriodRangeField meta={meta} ymFrom={ymFrom} ymTo={ymTo} onChange={onPeriod} />
    </div>
  );
}

const GUIDE_TIPS = [
  { icon: Bus, tone: "blue" as const, title: "대중교통 활용", text: "버스·기차 이용으로 이동 탄소를 줄여요." },
  { icon: Hotel, tone: "green" as const, title: "친환경 숙소 선택", text: "에너지 절약·일회용품 최소화 숙소를 선택해요." },
  { icon: Footprints, tone: "amber" as const, title: "도보 이동", text: "가까운 곳은 천천히 걸으며 자연을 즐겨요." },
  { icon: ShoppingBasket, tone: "purple" as const, title: "로컬 소비", text: "지역 농산물·로컬 가게 이용으로 상생해요." },
];
