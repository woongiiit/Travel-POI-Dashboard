"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award,
  Bot,
  Building2,
  Cloud,
  MapPin,
  Search,
  Sprout,
  Tags,
  Users,
} from "lucide-react";
import { useDataset } from "@/components/DataProvider";
import { AppIcon } from "@/components/icons";
import { PageHeader, Card, Kpi, LoadingState, ErrorState, Select, InsightBlock } from "@/components/ui";
import { EChart } from "@/components/charts/EChart";
import { MapView, type MapPoint } from "@/components/MapView";
import { ImageLightbox } from "@/components/ImageLightbox";
import { ALL } from "@/lib/aggregate";
import { compareBarOption, trendOption } from "@/lib/charts";
import { lclsColor } from "@/lib/categories";
import { fmtEmission, fmtInt, fmtNum, fmtYmFull } from "@/lib/format";
import type { Poi, PoiDetail } from "@/lib/types";

export default function RegionPage() {
  return (
    <Suspense fallback={<><PageHeader title="지역·POI 상세 분석" /><LoadingState /></>}>
      <RegionPageContent />
    </Suspense>
  );
}

function RegionPageContent() {
  const searchParams = useSearchParams();
  const { meta, pois, loading, error, loadMonthly } = useDataset();
  const [sido, setSido] = useState<string>("");
  const [sgg, setSgg] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PoiDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [monthly, setMonthly] = useState<Record<string, number[]> | null>(null);

  useEffect(() => {
    loadMonthly().then(setMonthly);
  }, [loadMonthly]);

  // 초기 시도/POI 선택 (URL ?poi= 파라미터 우선)
  useEffect(() => {
    if (!meta || sido) return;
    const poiId = searchParams.get("poi");
    if (poiId) {
      const poi = pois.find((p) => p.id === poiId);
      if (poi) {
        setSido(poi.sido);
        setSgg(poi.sgg);
        setSelectedId(poi.id);
        return;
      }
    }
    const urlSido = searchParams.get("sido");
    if (urlSido && meta.filters.sido.includes(urlSido)) {
      setSido(urlSido);
      const urlSgg = searchParams.get("sgg");
      if (urlSgg && (meta.filters.sggBySido[urlSido] ?? []).includes(urlSgg)) {
        setSgg(urlSgg);
      }
      return;
    }
    setSido(meta.filters.sido[0] ?? "");
  }, [meta, pois, sido, searchParams]);

  const regionPois = useMemo(() => {
    if (!sido) return [];
    return pois
      .filter((p) => p.sido === sido && (sgg === ALL || p.sgg === sgg))
      .sort((a, b) => b.e - a.e);
  }, [pois, sido, sgg]);

  useEffect(() => {
    if (regionPois.length && (!selectedId || !regionPois.find((p) => p.id === selectedId))) {
      setSelectedId(regionPois[0].id);
    }
  }, [regionPois, selectedId]);

  const selected = useMemo(
    () => pois.find((p) => p.id === selectedId) ?? null,
    [pois, selectedId],
  );

  // KTO 상세(사진/좌표) 조회
  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    setDetail(null);
    setPhotoOpen(false);
    fetch(`/api/poi/${selectedId}`)
      .then((r) => r.json())
      .then((d: PoiDetail) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const compare = useMemo(() => {
    if (!selected) return null;
    const sameMcls = pois.filter((p) => p.mcls === selected.mcls);
    const sameSgg = pois.filter((p) => p.sido === selected.sido && p.sgg === selected.sgg);
    const avg = (arr: Poi[], f: (p: Poi) => number) =>
      arr.length ? arr.reduce((s, p) => s + f(p), 0) / arr.length : 0;
    const mclsAvg = avg(sameMcls, (p) => p.e);
    const sggAvg = avg(sameSgg, (p) => p.e);
    return {
      selfE: selected.e,
      mclsAvg,
      sggAvg,
      vsMcls: mclsAvg ? ((selected.e - mclsAvg) / mclsAvg) * 100 : 0,
      vsSgg: sggAvg ? ((selected.e - sggAvg) / sggAvg) * 100 : 0,
      sameMcls,
    };
  }, [selected, pois]);

  const ranking = useMemo(() => {
    if (!selected || !compare) return [];
    return [...compare.sameMcls]
      .filter((p) => p.sido === selected.sido)
      .sort((a, b) => a.pc - b.pc)
      .slice(0, 8);
  }, [selected, compare]);

  const alternatives = useMemo(() => {
    if (!selected || !compare) return [];
    return [...compare.sameMcls]
      .filter((p) => p.id !== selected.id && p.pc <= selected.pc)
      .sort((a, b) => a.pc - b.pc)
      .slice(0, 2);
  }, [selected, compare]);

  const mapPoints: MapPoint[] = useMemo(() => {
    if (!selected) return [];
    const nearby = regionPois.slice(0, 40);
    const set = new Map<string, MapPoint>();
    for (const p of nearby) {
      set.set(p.id, {
        id: p.id,
        lon: detail?.mapx && p.id === selected.id ? detail.mapx : p.lon,
        lat: detail?.mapy && p.id === selected.id ? detail.mapy : p.lat,
        name: p.nm,
        sub: `${p.sgg} · ${p.lcls}`,
        emission: p.e,
        visitors: p.v,
        highlight: p.id === selected.id,
      });
    }
    return [...set.values()];
  }, [regionPois, selected, detail]);

  const selTrend = useMemo(() => {
    if (!selected || !monthly || !meta) return null;
    const arr = monthly[selected.id];
    if (!arr) return null;
    return { visitors: arr, emission: arr.map((v) => (v * selected.pc) / 1000) };
  }, [selected, monthly, meta]);

  if (loading) return (<><PageHeader title="지역·POI 상세 분석" /><LoadingState /></>);
  if (error || !meta) return (<><PageHeader title="지역·POI 상세 분석" /><ErrorState message={error ?? "오류"} /></>);

  const sggOptions = sido ? [ALL, ...(meta.filters.sggBySido[sido] ?? [])] : [ALL];
  const center: [number, number] | undefined =
    selected ? [detail?.mapx ?? selected.lon, detail?.mapy ?? selected.lat] : undefined;

  return (
    <>
      <PageHeader
        title="지역·POI 상세 분석"
        subtitle="선택 시도·시군구·POI의 관광 관심지점 탄소배출량 진단"
      />
      <div className="filterbar">
        <Select label="시도" icon={<AppIcon icon={Building2} size={14} />} value={sido} options={meta.filters.sido} onChange={(v) => { setSido(v); setSgg(ALL); }} />
        <Select label="시군구" icon={<AppIcon icon={MapPin} size={14} />} value={sgg} options={sggOptions} onChange={setSgg} />
        <div className="field" style={{ minWidth: 240 }}>
          <label><AppIcon icon={Search} size={14} className="field__icon" /> POI 선택</label>
          <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
            {regionPois.slice(0, 300).map((p) => (
              <option key={p.id} value={p.id}>{p.nm} ({p.sgg})</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: "auto", alignSelf: "flex-end", fontSize: 11, color: "var(--text-faint)" }}>
          기간 {fmtYmFull(meta.ymMin)} ~ {fmtYmFull(meta.ymMax)}
        </div>
      </div>

      {!selected ? (
        <div className="content"><LoadingState label="해당 지역에 POI가 없습니다." /></div>
      ) : (
        <div className="content">
          <div className="kpi-row">
            <Kpi variant="purple" icon={<AppIcon icon={Cloud} />} label="선택 POI 탄소배출량" value={fmtEmission(selected.e)} unit="tCO₂e"
              sub={<span className={selected.pc <= 1 ? "down" : "up"}>{selected.pc <= 1 ? "저배출" : "고배출"} · 1인당 {fmtNum(selected.pc, 2)}kg</span>} />
            <Kpi variant="blue" icon={<AppIcon icon={Users} />} label="총 방문자 수" value={fmtInt(selected.v)} unit="명"
              sub={`현지인 ${fmtInt(selected.vL)} · 외지인 ${fmtInt(selected.vO)}`} />
            <Kpi variant="purple" icon={<AppIcon icon={Award} />} label="전국 POI 배출 순위" value={`상위 ${rankPct(pois, selected)}%`}
              sub={`${fmtInt(pois.length)}개 중`} />
            <Kpi variant="amber" icon={<AppIcon icon={Tags} />} label="카테고리" value={selected.lcls}
              sub={`${selected.mcls} › ${selected.scls}`} />
            <Kpi variant="teal" icon={<AppIcon icon={MapPin} />} label="위치" value={selected.sgg} sub={selected.sido} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <Card title="선택 지역 지도" unit="선택 POI · 주변 POI">
              {center && <MapView points={mapPoints} height={320} center={center} zoom={11} onSelect={setSelectedId} />}
            </Card>

            <Card title="선택 POI 상세 정보">
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 150, height: 110, borderRadius: 10, overflow: "hidden", background: "var(--panel-2)", flexShrink: 0, display: "grid", placeItems: "center" }}>
                  {detailLoading ? (
                    <div className="spinner" />
                  ) : detail?.image ? (
                    <>
                      <button
                        type="button"
                        className="poi-photo-thumb"
                        onClick={() => setPhotoOpen(true)}
                        aria-label={`${selected.nm} 사진 확대`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={detail.image} alt={selected.nm} className="poi-photo-thumb__img" />
                        <span className="poi-photo-thumb__hint">클릭하여 확대</span>
                      </button>
                      <ImageLightbox
                        src={detail.image}
                        alt={selected.nm}
                        open={photoOpen}
                        onClose={() => setPhotoOpen(false)}
                      />
                    </>
                  ) : (
                    <AppIcon icon={Tags} size={28} style={{ color: lclsColor(selected.lcls) }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
                    {selected.nm} <span className={`badge ${selected.pc <= 1 ? "badge--green" : "badge--amber"}`}>{selected.pc <= 1 ? "저탄소" : "고탄소"}</span>
                  </div>
                  <InfoRow label="주소" value={detail?.addr ?? `${selected.sido} ${selected.sgg}`} />
                  <InfoRow label="대분류" value={selected.lcls} />
                  <InfoRow label="중분류" value={selected.mcls} />
                  {detail?.tel && <InfoRow label="연락처" value={detail.tel} />}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <MiniStat label="탄소배출량(총)" value={`${fmtEmission(selected.e)} tCO₂e`} note={`1인당 ${fmtNum(selected.pc, 2)} kgCO₂e`} />
                <MiniStat label="월평균 방문자" value={`${fmtInt(selected.v / meta.nMonths)} 명`} note={`총 ${fmtInt(selected.v)}명`} />
              </div>
              {detail?.source === "fallback" && detail.error?.includes("KTO_SERVICE_KEY") && (
                <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--text-faint)" }}>
                  ※ 한국관광공사 API 키(KTO_SERVICE_KEY) 설정 후 서버를 재시작하면 사진·주소가 표시됩니다.
                </div>
              )}
              {detail?.source === "kto" && !detail.image && (
                <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--text-faint)" }}>
                  ※ 이 POI는 한국관광공사 API에 등록된 대표 이미지가 없습니다.
                </div>
              )}
            </Card>

            <Card title="탄소배출량 비교" unit="tCO₂e (총량)">
              {compare && (
                <>
                  <EChart
                    option={compareBarOption(
                      ["선택 POI", "동일 중분류\n평균", "해당 시군구\n평균"],
                      [compare.selfE, compare.mclsAvg, compare.sggAvg],
                      ["#4B83E5", "#2D9B6A", "#718096"],
                    )}
                    height={210}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <DiffBox label="동일 중분류 평균 대비" v={compare.vsMcls} />
                    <DiffBox label="해당 시군구 평균 대비" v={compare.vsSgg} />
                  </div>
                </>
              )}
            </Card>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1.3fr 1.2fr 1fr" }}>
            <Card title="선택 POI 월별 추이" unit="방문자 / tCO₂e">
              {selTrend ? (
                <EChart option={trendOption(meta.ymList, selTrend.visitors, selTrend.emission)} height={240} />
              ) : (
                <LoadingState label="월별 데이터 로딩 중…" />
              )}
            </Card>

            <Card title="동일 중분류 저탄소 POI 순위" foot="※ 1인당 배출량 오름차순 (낮을수록 저탄소)">
              <div style={{ maxHeight: 250, overflow: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr><th>순위</th><th>POI명</th><th>시군구</th><th className="num">1인당</th><th className="num">총배출</th></tr>
                  </thead>
                  <tbody>
                    {ranking.map((p, i) => (
                      <tr key={p.id} style={p.id === selected.id ? { background: "var(--primary-soft)" } : undefined}
                          onClick={() => setSelectedId(p.id)} >
                        <td><span className="rank">{i + 1}</span></td>
                        <td style={{ fontWeight: p.id === selected.id ? 700 : 500, cursor: "pointer" }}>
                          {p.nm}{p.id === selected.id && <span className="badge badge--blue" style={{ marginLeft: 6 }}>선택</span>}
                        </td>
                        <td className="muted">{p.sgg}</td>
                        <td className="num">{fmtNum(p.pc, 2)}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmtEmission(p.e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="인근 저탄소 대안 추천">
              {alternatives.length ? alternatives.map((p) => (
                <InsightBlock
                  key={p.id}
                  icon={<AppIcon icon={Sprout} size={16} />}
                  tone="green"
                  onClick={() => setSelectedId(p.id)}
                  title={<>{p.nm} <span className="badge badge--green">저탄소</span></>}
                  text={`${p.sgg} · 1인당 ${fmtNum(p.pc, 2)} kgCO₂e · 총 ${fmtEmission(p.e)} tCO₂e`}
                />
              )) : <div className="insight__text">동일 중분류 내 더 낮은 배출 POI가 없습니다.</div>}
              <InsightBlock
                icon={<AppIcon icon={Bot} size={16} />}
                tone="teal"
                title="AI 여행자 인사이트"
                text={
                  `${selected.nm}는 동일 중분류 평균 대비 ${compare && compare.vsMcls < 0 ? `${fmtNum(Math.abs(compare.vsMcls), 1)}% 낮은` : `${fmtNum(Math.abs(compare?.vsMcls ?? 0), 1)}% 높은`} 탄소배출 수준입니다. ${selected.vO > selected.vL ? "외지인 비중이 높아 대중교통 이동 안내가 효과적입니다." : "현지인 방문이 많아 생활관광 연계가 가능합니다."}`
                }
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function rankPct(pois: Poi[], sel: Poi): number {
  const sorted = [...pois].sort((a, b) => b.e - a.e);
  const idx = sorted.findIndex((p) => p.id === sel.id);
  return Math.max(1, Math.round(((idx + 1) / pois.length) * 100));
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 12, marginBottom: 3, display: "flex", gap: 6 }}>
      <span style={{ color: "var(--text-faint)", width: 40, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ background: "var(--panel-2)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "2px 0" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{note}</div>
    </div>
  );
}

function DiffBox({ label, v }: { label: string; v: number }) {
  const lower = v < 0;
  return (
    <div style={{ flex: 1, background: lower ? "var(--green-soft)" : "var(--red-soft)", borderRadius: 10, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: lower ? "var(--green)" : "var(--red)" }}>
        {lower ? "" : "+"}{fmtNum(v, 1)}%
      </div>
    </div>
  );
}
