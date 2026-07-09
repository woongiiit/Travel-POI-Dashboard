"use client";

import { useMemo, useState } from "react";
import {
  Bike,
  Calendar,
  Compass,
  Lightbulb,
  MapPin,
  Megaphone,
  Route,
  Sprout,
  Tags,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useDataset } from "@/components/DataProvider";
import { AppIcon } from "@/components/icons";
import { PageHeader, Card, Kpi, LoadingState, ErrorState, Select, InsightBlock } from "@/components/ui";
import { EChart } from "@/components/charts/EChart";
import { MapView, type MapPoint } from "@/components/MapView";
import { ALL } from "@/lib/aggregate";
import { scatterOption } from "@/lib/charts";
import { lclsColor } from "@/lib/categories";
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

export default function DiscoverPage() {
  const { meta, pois, loading, error } = useDataset();
  const [sido, setSido] = useState<string>(ALL);
  const [lcls, setLcls] = useState<string>(ALL);
  const [mcls, setMcls] = useState<string>(ALL);

  const data = useMemo(() => {
    if (!meta) return null;
    const f = pois.filter(
      (p) =>
        (sido === ALL || p.sido === sido) &&
        (lcls === ALL || p.lcls === lcls) &&
        (mcls === ALL || p.mcls === mcls),
    );
    const mvs = f.map((p) => p.v / meta.nMonths);
    const pcs = f.map((p) => p.pc);
    const medV = median(mvs);
    const medPc = median(pcs);
    const pcQ25 = quantile(pcs, 0.25);

    // 점수: 인기(로그) × 탄소효율(낮은 1인당 배출)
    const scored: Scored[] = f.map((p) => {
      const mv = p.v / meta.nMonths;
      const eff = medPc / Math.max(p.pc, 0.05);
      const pop = Math.log10(Math.max(mv, 1)) / Math.log10(Math.max(medV * 4, 10));
      const score = eff * 0.55 + pop * 0.45;
      return { ...p, mv, score, grade: "C" };
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

    return {
      f, scored, medV, medPc, eligible, lowPopular, candidates, hidden,
      routes: routeSgg.size,
    };
  }, [meta, pois, sido, lcls, mcls]);

  if (loading) return (<><PageHeader title="저탄소 관광콘텐츠 발굴" /><LoadingState /></>);
  if (error || !meta || !data) return (<><PageHeader title="저탄소 관광콘텐츠 발굴" /><ErrorState message={error ?? "오류"} /></>);

  const mclsOptions = lcls === ALL ? [ALL] : [ALL, ...(meta.filters.mclsByLcls[lcls] ?? [])];

  const scatterPoints = data.scored
    .slice()
    .sort((a, b) => b.e - a.e)
    .slice(0, 900)
    .map((p) => ({
      name: p.nm,
      visitors: p.mv,
      perCapita: p.pc,
      emission: p.e,
      color: lclsColor(p.lcls),
    }));

  const recommend = data.eligible.filter((p) => p.grade !== "C").slice(0, 12);

  const mapPoints: MapPoint[] = data.eligible.slice(0, 120).map((p) => ({
    id: p.id, lon: p.lon, lat: p.lat, name: p.nm,
    sub: `${p.sgg} · ${p.grade}등급`, emission: p.e, visitors: p.v,
  }));

  return (
    <>
      <PageHeader title="저탄소 관광콘텐츠 발굴" subtitle="인기와 탄소배출량을 함께 고려한 POI 추천 분석" />
      <div className="filterbar">
        <Select label="지역" icon={<AppIcon icon={MapPin} size={14} />} value={sido} options={[ALL, ...meta.filters.sido]} onChange={setSido} />
        <Select label="대분류" icon={<AppIcon icon={Tags} size={14} />} value={lcls} options={[ALL, ...meta.filters.lcls]} onChange={(v) => { setLcls(v); setMcls(ALL); }} />
        <Select label="중분류" icon={<AppIcon icon={TrendingUp} size={14} />} value={mcls} options={mclsOptions} onChange={setMcls} />
      </div>

      <div className="content">
        <div className="kpi-row">
          <Kpi variant="green" icon={<AppIcon icon={Trophy} />} label="저탄소 인기 POI 수" value={fmtInt(data.lowPopular.length)} unit="개" sub="고인기·저배출 사분면" />
          <Kpi variant="teal" icon={<AppIcon icon={Sprout} />} label="고관심 저배출 후보 수" value={fmtInt(data.candidates.length)} unit="개" sub="1인당 배출 중앙값 이하" />
          <Kpi variant="blue" icon={<AppIcon icon={Compass} />} label="탄소중립 추천코스 수" value={fmtInt(data.routes)} unit="개" sub="추천 POI 보유 시군구" />
          <Kpi variant="amber" icon={<AppIcon icon={Lightbulb} />} label="신규 발굴 콘텐츠 수" value={fmtInt(data.hidden.length)} unit="개" sub="숨은 저탄소 명소" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
          <Card title="POI 인기(방문자) 대비 탄소배출 포지셔닝" unit="버블 크기=총 배출량, 점선=중앙값">
            <EChart option={scatterOption(scatterPoints, data.medV, data.medPc)} height={380} />
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
              <span>↘ 우하단: <b style={{ color: "var(--green)" }}>저탄소·고인기</b> (추천)</span>
              <span>↗ 우상단: 고탄소·고인기</span>
              <span>↙ 좌하단: 저탄소·저인기 (숨은 명소)</span>
            </div>
          </Card>

          <Card title="저탄소 추천 POI" foot="※ 인기 대비 탄소효율 + 저배출 종합 점수 기준">
            <div style={{ maxHeight: 380, overflow: "auto" }}>
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
                      <td className="muted">{p.mcls}</td>
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
          <Card title="지역별 저탄소 추천 POI 분포">
            <MapView points={mapPoints} height={300} />
          </Card>

          <Card title="저탄소 콘텐츠 발굴 로직">
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <LogicBox no="1" w="50%" title="인기 대비 탄소효율" desc="탄소효율지수 = 월평균 방문자 / 1인당 배출량. 높을수록 효율적" color="var(--green)" />
              <Plus />
              <LogicBox no="2" w="30%" title="접근성" desc="대중교통 접근성·이동 편의성(가정)" color="var(--data-blue)" />
              <Plus />
              <LogicBox no="3" w="20%" title="연계 가능성" desc="주변 관광자원 연계·체류시간(가정)" color="var(--carbon-purple)" />
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

function LogicBox({ no, title, desc, color, w }: { no: string; title: string; desc: string; color: string; w: string }) {
  return (
    <div style={{ width: w, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 11px", background: "var(--panel)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: color, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{no}</span>
        <strong style={{ fontSize: 12.5 }}>{title}</strong>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}
function Plus() {
  return <div style={{ display: "grid", placeItems: "center", color: "var(--text-faint)", fontWeight: 700 }}>+</div>;
}
function Tip({ icon, tone, text }: { icon: React.ReactNode; tone: "green" | "blue" | "purple" | "amber"; text: string }) {
  return (
    <InsightBlock icon={icon} tone={tone} text={text} />
  );
}
