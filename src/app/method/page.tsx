import {
  AlertTriangle,
  Building2,
  Database,
  HelpCircle,
  Info,
  Map,
  MapPin,
  Puzzle,
  Tags,
} from "lucide-react";
import { getMeta, getFactors } from "@/lib/server-data";
import { PageHeader, StatRow } from "@/components/ui";
import { fmtInt, fmtYmFull } from "@/lib/format";

export default function MethodPage() {
  const meta = getMeta();
  const { factors } = getFactors();
  const k = meta.kpis;

  const mclsByLcls = meta.filters.mclsByLcls;
  const nMcls = Object.values(mclsByLcls).reduce((s, v) => s + v.length, 0);

  return (
    <>
      <PageHeader title="산정 방식 안내" subtitle="POI 방문자수 기반 탄소배출량 산정 흐름" />
      <div className="content">
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <InfoCard color="var(--data-blue)" icon={<Info size={16} strokeWidth={2} />} title="산정 개요">
            본 서비스는 KT 통신데이터 기반 POI 방문자수에 1인당 탄소배출계수를 적용하여 월별 탄소배출량을 산출하고,
            다양한 행정·공간 단위로 집계합니다.
          </InfoCard>
          <InfoCard color="var(--green)" icon={<Database size={16} strokeWidth={2} />} title="데이터 범위">
            <ul style={ul}>
              <li>공간 범위: 전국 {k.nSido}개 시도, {k.nSgg}개 시군구</li>
              <li>분석 대상: 약 {fmtInt(k.nPoi)}개 관광 POI</li>
              <li>기간 범위: 월별 {fmtYmFull(meta.ymMin)} ~ {fmtYmFull(meta.ymMax)} ({meta.nMonths}개월)</li>
            </ul>
          </InfoCard>
          <InfoCard color="var(--amber)" icon={<AlertTriangle size={16} strokeWidth={2} />} title="유의사항">
            <ul style={ul}>
              <li>통신데이터 기반 추정치로 실제 방문객 수와 차이가 있을 수 있습니다.</li>
              <li>POI 분류·탄소배출계수는 주기적으로 업데이트됩니다.</li>
              <li>배출계수는 가정값이며 정책·연구에 따라 변경될 수 있습니다.</li>
            </ul>
          </InfoCard>
        </div>

        <section className="card">
          <div className="card__head"><div className="card__title">산정 흐름 (5단계)</div></div>
          <div className="card__body">
            <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
              {STEPS.map((s, i) => (
                <div key={s.t} style={{ display: "flex", alignItems: "stretch", gap: 10, flex: "1 1 160px" }}>
                  <div style={{ flex: 1, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 13px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                      <span style={stepNo}>{i + 1}</span>
                      <strong style={{ fontSize: 12.5 }}>{s.t}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{s.d}</div>
                  </div>
                  {i < STEPS.length - 1 && <div style={{ display: "grid", placeItems: "center", color: "var(--text-faint)" }}>→</div>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, background: "var(--teal-soft)", borderRadius: 12, padding: "16px", textAlign: "center", border: "1px solid rgba(11,90,74,0.1)" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--teal)" }}>
                POI 탄소배출량 = 월별 방문자수 × 1인당 탄소배출계수
              </span>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                ※ 배출 단위: kgCO₂e (이산화탄소 환산톤)
              </div>
            </div>
          </div>
        </section>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
          <section className="card">
            <div className="card__head"><div className="card__title">데이터 범위 요약</div></div>
            <div className="card__body">
              <SummaryRow icon={<Map size={16} strokeWidth={2} />} label="전국" value={`${k.nSido}개 시도`} />
              <SummaryRow icon={<Building2 size={16} strokeWidth={2} />} label="시군구" value={`${k.nSgg}개`} />
              <SummaryRow icon={<MapPin size={16} strokeWidth={2} />} label="관광 POI" value={`약 ${fmtInt(k.nPoi)}개`} />
              <SummaryRow icon={<Tags size={16} strokeWidth={2} />} label="대분류 카테고리" value={`${meta.filters.lcls.length}개`} />
              <SummaryRow icon={<Puzzle size={16} strokeWidth={2} />} label="중분류 카테고리" value={`${nMcls}개`} last />
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <div className="card__title">중분류별 1인당 탄소배출계수</div>
              <span className="card__unit">kgCO₂e/인 · 가정값</span>
            </div>
            <div className="card__body">
              <div style={{ maxHeight: 360, overflow: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>대분류</th><th>중분류</th><th className="num">배출계수</th></tr></thead>
                  <tbody>
                    {meta.filters.lcls.flatMap((lcls) =>
                      (mclsByLcls[lcls] ?? []).map((mcls) => (
                        <tr key={lcls + mcls}>
                          <td className="muted">{lcls}</td>
                          <td style={{ fontWeight: 600 }}>{mcls}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{(factors[mcls] ?? 1).toFixed(1)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card__head"><div className="card__title">FAQ / 주석</div></div>
          <div className="card__body">
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              {FAQ.map((f) => (
                <div key={f.q} style={{ background: "var(--panel-2)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--teal)", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                    <HelpCircle size={14} strokeWidth={2} /> {f.q}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.6 }}>{f.a}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-faint)", textAlign: "right" }}>
              출처: 한국관광공사 · 환경부 · 기상청 / 데이터 업데이트: {meta.updatedAt}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

const ul: React.CSSProperties = { margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 };
const stepNo: React.CSSProperties = { width: 20, height: 20, borderRadius: 6, background: "var(--teal)", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 };

function InfoCard({ color, icon, title, children }: { color: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ borderTop: `3px solid ${color}` }}>
      <div className="card__head">
        <div className="card__title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color }}>{icon}</span> {title}
        </div>
      </div>
      <div className="card__body" style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

function SummaryRow({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <div className="stat-row" style={{ borderBottom: last ? "none" : undefined }}>
      <span className="stat-row__icon">{icon}</span>
      <span className="stat-row__label">{label}</span>
      <span className="stat-row__value">{value}</span>
    </div>
  );
}

const STEPS = [
  { t: "통신데이터 수집", d: "KT 통신데이터를 활용해 POI별 월별 방문자수를 수집·집계합니다." },
  { t: "대·중분류 분류", d: "관광 진흥법 체계 기준으로 각 POI를 대분류·중분류로 분류합니다." },
  { t: "배출계수 적용", d: "중분류별 1인당 탄소배출계수를 적용하여 배출량을 추정합니다." },
  { t: "월별 배출량 산출", d: "월별 방문자수 × 배출계수로 POI별 월별 탄소배출량을 산출합니다." },
  { t: "단위별 집계", d: "시도·시군구·POI 단위로 집계하여 제공합니다." },
];

const FAQ = [
  { q: "Q1. 배출계수는 어떻게 정하나요?", a: "체류·이동 강도가 높은 숙박·항공레저는 높게, 자연·도시공원은 낮게 가정했습니다. 실제 계수는 정책·연구에 따라 정교화됩니다." },
  { q: "Q2. 이 데이터는 어떤 목적인가요?", a: "여행자의 여행 계획, 친환경 여행 선택, 지역 간 비교 등 여행자·정책 참고용으로 제공됩니다." },
  { q: "Q3. 사진·좌표는 어디서 오나요?", a: "한국관광공사 국문 관광정보 서비스(GW) API의 contentId 기반으로 사진·좌표를 조회합니다." },
];
