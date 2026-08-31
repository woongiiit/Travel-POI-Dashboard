"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  Calendar,
  Compass,
  Lightbulb,
  MapPin,
  Megaphone,
  Route,
  Shuffle,
  Sprout,
  Tags,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useDataset } from "@/components/DataProvider";
import { AppIcon } from "@/components/icons";
import { PeriodRangeField } from "@/components/PeriodRangeField";
import { PageHeader, Card, Kpi, LoadingState, ErrorState, Select, InsightBlock } from "@/components/ui";
import { EChart } from "@/components/charts/EChart";
import { MapView, type MapPoint } from "@/components/MapView";
import { ALL, isFullYmRange, poiScopedMetrics, resolveYmRange } from "@/lib/aggregate";
import {
  QUADRANT_META,
  quadrantOf,
  scatterOption,
  scatterPointId,
  type PositioningPoint,
  type QuadrantKey,
} from "@/lib/charts";
import { fmtEmission, fmtInt, fmtNum } from "@/lib/format";
import type { Poi } from "@/lib/types";

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

interface Scored extends Poi {
  mv: number; // 월평균 방문자
  score: number;
  grade: "S" | "A" | "B" | "C";
}

/** 산점도에 사분면별로 표시할 대표 POI 수 */
const SAMPLE_PER_QUADRANT = 10;

/** 시드 기반 의사난수 (같은 시드 → 같은 표본, 세션마다 시드가 달라짐) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleN<T>(arr: T[], n: number, rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export default function DiscoverPage() {
  const { meta, pois, loading, error, loadMonthly } = useDataset();
  const router = useRouter();
  const [sido, setSido] = useState<string>(ALL);
  const [sgg, setSgg] = useState<string>(ALL);
  const [lcls, setLcls] = useState<string>(ALL);
  const [mcls, setMcls] = useState<string>(ALL);
  const [monthly, setMonthly] = useState<Record<string, number[]> | null>(null);
  const [ymFrom, setYmFrom] = useState("");
  const [ymTo, setYmTo] = useState("");
  // 세션(마운트)마다 다른 표본이 뽑히도록 무작위 시드로 시작
  const [sampleSeed, setSampleSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const reshuffle = useCallback(() => setSampleSeed(Math.floor(Math.random() * 2 ** 31)), []);

  useEffect(() => { loadMonthly().then(setMonthly); }, [loadMonthly]);

  useEffect(() => {
    if (!meta || (ymFrom && ymTo)) return;
    setYmFrom(meta.ymMin);
    setYmTo(meta.ymMax);
  }, [meta, ymFrom, ymTo]);

  const ymFromR = ymFrom || meta?.ymMin || "";
  const ymToR = ymTo || meta?.ymMax || "";
  const periodReady = !meta || isFullYmRange(meta.ymList, ymFromR, ymToR) || !!monthly;

  const data = useMemo(() => {
    if (!meta || !periodReady) return null;
    const { nMonths: periodMonths } = resolveYmRange(meta.ymList, ymFromR, ymToR);
    const metrics = (p: Poi) => poiScopedMetrics(p, ALL, ymFromR, ymToR, meta.ymList, monthly);
    const f = pois.filter(
      (p) =>
        (sido === ALL || p.sido === sido) &&
        (sgg === ALL || p.sgg === sgg) &&
        (lcls === ALL || p.lcls === lcls) &&
        (mcls === ALL || p.mcls === mcls),
    );
    const mvs = f.map((p) => metrics(p).visitors / periodMonths);
    const pcs = f.map((p) => p.pc);
    const medV = median(mvs);
    const medPc = median(pcs);
    const pcQ25 = quantile(pcs, 0.25);

    const scored: Scored[] = f.map((p) => {
      const m = metrics(p);
      const mv = m.visitors / periodMonths;
      const eff = medPc / Math.max(p.pc, 0.05);
      const pop = Math.log10(Math.max(mv, 1)) / Math.log10(Math.max(medV * 4, 10));
      const score = eff * 0.55 + pop * 0.45;
      return { ...p, v: m.visitors, e: m.emission, mv, score, grade: "C" as const };
    });
    scored.sort((a, b) => b.score - a.score);

    // 등급 부여 (저탄소: pc<=median 인 경우만 추천 대상)
    const eligible = scored.filter((p) => p.pc <= medPc);
    eligible.forEach((p, i) => {
      const r = i / Math.max(eligible.length - 1, 1);
      p.grade = r <= 0.1 ? "S" : r <= 0.3 ? "A" : r <= 0.6 ? "B" : "C";
    });

    const lowPopular = scored.filter((p) => p.pc <= medPc && p.mv >= medV);
    const candidates = scored.filter((p) => p.pc <= medPc);
    const hidden = scored.filter((p) => p.pc <= pcQ25 && p.mv < medV);
    const routeSgg = new Set(eligible.slice(0, 200).map((p) => p.sido + p.sgg));

    const quadrants = {
      hiPopLowPc: lowPopular.length,
      hiPopHiPc: scored.filter((p) => p.pc > medPc && p.mv >= medV).length,
      loPopLowPc: scored.filter((p) => p.pc <= medPc && p.mv < medV).length,
      loPopHiPc: scored.filter((p) => p.pc > medPc && p.mv < medV).length,
    };

    return {
      f, scored, medV, medPc, eligible, lowPopular, candidates, hidden, quadrants,
      routes: routeSgg.size,
    };
  }, [meta, pois, sido, sgg, lcls, mcls, ymFromR, ymToR, monthly, periodReady]);

  const scatterSample = useMemo(() => {
    if (!data) return { picked: [] as Scored[], positionPoints: [] as PositioningPoint[] };
    const buckets = new Map<QuadrantKey, Scored[]>();
    for (const p of data.scored) {
      const q = quadrantOf(p.mv, p.pc, data.medV, data.medPc);
      const bucket = buckets.get(q);
      if (bucket) bucket.push(p);
      else buckets.set(q, [p]);
    }
    const rand = mulberry32(sampleSeed);
    const picked = (Object.keys(QUADRANT_META) as QuadrantKey[]).flatMap((q) =>
      sampleN(buckets.get(q) ?? [], SAMPLE_PER_QUADRANT, rand),
    );
    const positionPoints: PositioningPoint[] = picked.map((p) => ({
      id: p.id,
      name: p.nm,
      sgg: p.sgg,
      lcls: p.lcls,
      visitors: p.mv,
      perCapita: p.pc,
      emission: p.e,
    }));
    return { picked, positionPoints };
  }, [data, sampleSeed]);

  const scatterConfig = useMemo(() => {
    if (!data) return null;
    return scatterOption(scatterSample.positionPoints, data.medV, data.medPc);
  }, [data, scatterSample]);

  const mapPoints: MapPoint[] = useMemo(() => {
    if (!data) return [];
    return scatterSample.picked
      .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
      .map((p) => {
        const q = quadrantOf(p.mv, p.pc, data.medV, data.medPc);
        return {
          id: p.id,
          lon: p.lon,
          lat: p.lat,
          name: p.nm,
          sub: `${QUADRANT_META[q].note} · ${p.sgg}`,
          emission: p.e,
          visitors: p.v,
          radius: Math.min(18, Math.max(8, 7 + 3.2 * Math.log10(Math.max(p.e, 1) + 1))),
        };
      });
  }, [scatterSample, data]);

  const mapBounds = useMemo(() => {
    const scatterCoords = scatterSample.picked.filter(
      (p) => Number.isFinite(p.lon) && Number.isFinite(p.lat),
    );
    if (scatterCoords.length) return boundsFromPoints(scatterCoords);
    if (sido === ALL) return null;
    const region = pois.filter(
      (p) =>
        p.sido === sido &&
        (sgg === ALL || p.sgg === sgg) &&
        Number.isFinite(p.lon) &&
        Number.isFinite(p.lat),
    );
    return boundsFromPoints(region);
  }, [pois, sido, sgg, scatterSample]);

  const mapFitMaxZoom = sgg !== ALL ? 12 : 9;
  const mapFitMinZoom = sgg !== ALL ? 9.5 : 7;

  if (loading) return (<><PageHeader title="저탄소 관광콘텐츠 발굴" /><LoadingState /></>);
  if (error || !meta) return (<><PageHeader title="저탄소 관광콘텐츠 발굴" /><ErrorState message={error ?? "오류"} /></>);
  if (!periodReady) return (<><PageHeader title="저탄소 관광콘텐츠 발굴" /><LoadingState label="월별 데이터 로딩 중…" /></>);
  if (!data) return (<><PageHeader title="저탄소 관광콘텐츠 발굴" /><LoadingState /></>);

  const mclsOptions = lcls === ALL ? [ALL] : [ALL, ...(meta.filters.mclsByLcls[lcls] ?? [])];
  const sggOptions = sido === ALL ? [ALL] : [ALL, ...(meta.filters.sggBySido[sido] ?? [])];

  const recommend = data.eligible.filter((p) => p.grade !== "C").slice(0, 12);

  const handleScatterSelect = (params: unknown) => {
    const id = scatterPointId(params);
    if (!id) return;
    const poi = pois.find((p) => p.id === id);
    if (!poi) return;
    const query = new URLSearchParams({ poi: id, sido: poi.sido, sgg: poi.sgg });
    router.push(`/region?${query.toString()}`);
  };

  const handleMapSelect = (id: string) => {
    const poi = pois.find((p) => p.id === id);
    if (!poi) return;
    const query = new URLSearchParams({ poi: id, sido: poi.sido, sgg: poi.sgg });
    router.push(`/region?${query.toString()}`);
  };

  return (
    <>
      <PageHeader title="저탄소 관광콘텐츠 발굴" subtitle="인기와 탄소배출량을 함께 고려한 POI 추천 분석" />
      <div className="filterbar">
        <Select label="지역" icon={<AppIcon icon={MapPin} size={14} />} value={sido} options={[ALL, ...meta.filters.sido]} onChange={(v) => { setSido(v); setSgg(ALL); }} />
        <Select label="시군구" icon={<AppIcon icon={MapPin} size={14} />} value={sgg} options={sggOptions} onChange={setSgg} />
        <Select label="대분류" icon={<AppIcon icon={Tags} size={14} />} value={lcls} options={[ALL, ...meta.filters.lcls]} onChange={(v) => { setLcls(v); setMcls(ALL); }} />
        <Select label="중분류" icon={<AppIcon icon={TrendingUp} size={14} />} value={mcls} options={mclsOptions} onChange={setMcls} />
        <PeriodRangeField
          meta={meta}
          ymFrom={ymFrom}
          ymTo={ymTo}
          onChange={(f, t) => { setYmFrom(f); setYmTo(t); }}
        />
      </div>

      <div className="content">
        <div className="kpi-row">
          <Kpi variant="green" icon={<AppIcon icon={Trophy} />} label="저탄소 인기 POI 수" value={fmtInt(data.lowPopular.length)} unit="개" sub="고인기·저배출 사분면" />
          <Kpi variant="teal" icon={<AppIcon icon={Sprout} />} label="고관심 저배출 후보 수" value={fmtInt(data.candidates.length)} unit="개" sub="1인당 배출 중앙값 이하" />
          <Kpi variant="blue" icon={<AppIcon icon={Compass} />} label="탄소중립 추천코스 수" value={fmtInt(data.routes)} unit="개" sub="추천 POI 보유 시군구" />
          <Kpi variant="amber" icon={<AppIcon icon={Lightbulb} />} label="신규 발굴 콘텐츠 수" value={fmtInt(data.hidden.length)} unit="개" sub="숨은 저탄소 명소" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
          <Card
            title="POI 인기 대비 탄소배출 포지셔닝"
            right={
              <button type="button" className="quad-shuffle" onClick={reshuffle}>
                <AppIcon icon={Shuffle} size={12} />
                다시 뽑기
              </button>
            }
            foot={`※ 사분면별 대표 ${SAMPLE_PER_QUADRANT}개 무작위 · 버블=총 배출량 · 양축 로그. 표시 POI는 표본이며 [다시 뽑기]로 교체할 수 있습니다. 칩 건수는 필터 전체 기준. 버블 클릭 시 상세로 이동합니다.`}
          >
            {scatterConfig && (
              <EChart option={scatterConfig} height={420} onEvents={{ click: handleScatterSelect }} />
            )}
            <div className="quad-legend">
              {(Object.keys(QUADRANT_META) as QuadrantKey[]).map((q) => (
                <QuadrantChip
                  key={q}
                  color={QUADRANT_META[q].color}
                  label={QUADRANT_META[q].label}
                  note={QUADRANT_META[q].note}
                  count={data.quadrants[q]}
                />
              ))}
            </div>
          </Card>

          <Card title="저탄소 추천 POI" foot="※ 인기 대비 탄소효율 + 저배출 종합 점수 기준">
            <div style={{ maxHeight: 430, overflow: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr><th>순위</th><th>POI명</th><th>시군구</th><th>중분류</th><th className="num">1인당</th><th>등급</th></tr>
                </thead>
                <tbody>
                  {recommend.map((p, i) => (
                    <tr key={p.id}>
                      <td><span className="rank">{i + 1}</span></td>
                      <td style={{ fontWeight: 600 }}>{p.nm}</td>
                      <td className="muted">{p.sgg}</td>
                      <td className="muted tbl-mcls" title={p.mcls}>{p.mcls}</td>
                      <td className="num">{fmtNum(p.pc, 2)}</td>
                      <td><span className={`grade grade--${p.grade}`}>{p.grade}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1.3fr 1fr" }}>
          <Card title="지역별 저탄소 추천 POI 분포" foot="※ 포지셔닝 차트 표본 POI와 동일 · 클릭 시 상세로 이동">
            <MapView
              points={mapPoints}
              height={300}
              bounds={mapBounds}
              fitMaxZoom={mapFitMaxZoom}
              fitMinZoom={mapFitMinZoom}
              onSelect={handleMapSelect}
            />
          </Card>

          <Card title="저탄소 콘텐츠 발굴 로직">
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <LogicBox no="1" title="인기 대비 탄소효율" desc="탄소효율지수 = 월평균 방문자 / 1인당 배출량. 높을수록 효율적" color="var(--green)" />
              <Plus />
              <LogicBox no="2" title="접근성" desc="대중교통 접근성·이동 편의성(가정)" color="var(--data-blue)" />
              <Plus />
              <LogicBox no="3" title="연계 가능성" desc="주변 관광자원 연계·체류시간(가정)" color="var(--carbon-purple)" />
            </div>
            <div style={{ marginTop: 12, background: "var(--panel-2)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
              종합 점수 산출 → 등급 부여 <b>S &gt; A &gt; B &gt; C</b>
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 4 }}>
                ※ 접근성·연계성 가중치는 향후 대중교통/주변 POI 데이터 연동 시 정교화됩니다.
              </div>
            </div>
          </Card>

          <Card title="콘텐츠 개발 시사점">
            <Tip icon={<AppIcon icon={Bike} size={16} />} tone="green" text="저탄소·고인기 POI는 대중교통·도보·자전거 연계 코스로 확장 가치가 높습니다." />
            <Tip icon={<AppIcon icon={Megaphone} size={16} />} tone="blue" text="저탄소·저인기(숨은 명소)는 홍보·접근성 개선으로 성장 잠재력이 큽니다." />
            <Tip icon={<AppIcon icon={Route} size={16} />} tone="purple" text="연계형 테마 코스 개발로 체류시간·지역경제 효과를 확대할 수 있습니다." />
            <Tip icon={<AppIcon icon={Calendar} size={16} />} tone="amber" text="계절별 특화 콘텐츠 발굴로 연중 방문 분산을 유도합니다." />
          </Card>
        </div>
      </div>
    </>
  );
}

function QuadrantChip({ color, label, note, count }: { color: string; label: string; note: string; count: number }) {
  return (
    <span className="quad-chip">
      <i className="quad-chip__dot" style={{ background: color }} />
      <b>{label}</b>
      <span className="quad-chip__note">{note}</span>
      <span className="quad-chip__count">{fmtInt(count)}개</span>
    </span>
  );
}

function LogicBox({ no, title, desc, color }: { no: string; title: string; desc: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 11px", background: "var(--panel)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: color, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{no}</span>
        <strong style={{ fontSize: 12.5 }}>{title}</strong>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}
function Plus() {
  return <div style={{ display: "grid", placeItems: "center", color: "var(--text-faint)", fontWeight: 700 }}>+</div>;
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
  const padLon = Math.max((maxLon - minLon) * 0.12, 0.04);
  const padLat = Math.max((maxLat - minLat) * 0.12, 0.04);
  return [
    [minLon - padLon, minLat - padLat],
    [maxLon + padLon, maxLat + padLat],
  ];
}

function Tip({ icon, tone, text }: { icon: React.ReactNode; tone: "green" | "blue" | "purple" | "amber"; text: string }) {
  return (
    <InsightBlock icon={icon} tone={tone} text={text} />
  );
}
