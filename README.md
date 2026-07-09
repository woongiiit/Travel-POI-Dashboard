# 탄소중립 관광 대시보드 (KT 통신데이터 기반 POI 탄소배출량)

KT 통신데이터 기반 관광 관심지점(POI) 방문자수에 중분류별 탄소배출계수를 적용하여
전국 탄소배출량을 산출·시각화하는 대시보드입니다. 시안(`참고자료/2차 대시보드 개발.pdf`)의
P0~P5 구성을 그대로 구현했습니다.

- **프레임워크**: Next.js 15 (App Router) + React 19 + TypeScript
- **차트**: ECharts (라인/막대/도넛/트리맵/산점도)
- **지도**: MapLibre GL (무료 데모 벡터 타일, API 키 불필요)
- **사진/좌표**: 한국관광공사 국문 관광정보 서비스(GW) API (`contentId` 기반)

## 화면 구성

| 경로 | 페이지 | 내용 |
| --- | --- | --- |
| `/` | P0 전국 POI 현황 | KPI 6종, 전국 분포 지도, Top10, 월별 추이, 카테고리 도넛, AI 요약 |
| `/region` | P1 지역·POI 상세 | 선택 POI 사진/상세, 비교 막대, 월별 추이, 동일 중분류 순위, 저탄소 대안 |
| `/category` | P2 카테고리 분석 | 대분류 막대, 중분류 38종 테이블, 계절 추이, 트리맵, AI 요약 |
| `/discover` | P3 저탄소 콘텐츠 발굴 | 인기-배출 포지셔닝 산점도, S/A/B/C 추천 등급, 분포 지도, 발굴 로직 |
| `/guide` | P4 AI 여행자 가이드 | 지역 탄소수준, 추천 코스, 탄소중립 가이드, 유사 저탄소 POI 카드 |
| `/method` | P5 산정 방식 안내 | 산정 흐름 5단계, 공식, 데이터 범위, 중분류별 배출계수표, FAQ |

## 데이터 파이프라인

원본 엑셀(`참고자료/(kt)관광지_현지인_외지인.xlsx`, 690,365행)을 집계하여 `data/`에 JSON으로 생성합니다.

```bash
# Python 3 + openpyxl 필요
python scripts/build_data.py

# (권장) KTO API 실좌표 일괄 수집 — .env.local에 KTO_SERVICE_KEY 필요
npm run fetch:coords
# areaBasedSyncList2 목록 API(~500회)로 contentId 매칭 → pois.json 반영
# 중단 후 재실행 시 페이지 resume. 미매칭분: --detail-fallback
```

산출물:

- `data/meta.json` — 필터 목록, 전국 KPI, 카테고리/지역 롤업, 월별 추이
- `data/pois.json` — POI별 집계(방문자/배출량/현지인·외지인/지도 좌표)
- `data/poi_monthly.json` — POI별 월별 방문자 시계열
- `data/factors.json` — 중분류별 1인당 탄소배출계수 (앱과 공유)

> **탄소배출량(tCO₂e) = Σ(월별 방문자수 × 중분류 배출계수[kgCO₂e/인]) / 1000**
> 배출계수(`scripts/factors.json`)는 시안 P5 산정식에 따른 **가정값**이며,
> 체류·이동 강도가 높은 숙박/항공레저는 높게, 자연·도시공원은 낮게 설정했습니다.

### 데이터 범위 (산출 결과)

- POI 8,588개 · 17개 시도 · 252개 시군구
- 기간 2023.01 ~ 2026.05 (41개월)
- 대분류 9종 · 중분류 38종 · 방문객 유형(현지인/외지인)

## 실행

```bash
npm install
cp .env.example .env.local   # 한국관광공사 서비스키 입력
npm run dev                  # http://localhost:3000
```

프로덕션 빌드:

```bash
npm run build && npm start
```

## 한국관광공사 API 연동

`.env.local`에 발급받은 **디코딩 서비스키**를 입력하세요.

```
KTO_SERVICE_KEY=발급받은_서비스키
```

- 사용 엔드포인트: `KorService2/detailCommon2` (사진 `firstimage`, 좌표 `mapx/mapy`, 주소/개요)
- 서버 라우트 `GET /api/poi/[id]`에서 24시간 캐시하여 호출합니다.
- **전국 지도 실좌표**: `npm run fetch:coords` — `areaBasedSyncList2` 일괄 목록(~500 API) + `contentId` 매칭
- **키 미설정 시**: 사진 영역은 카테고리 아이콘으로, 좌표는 시도 중심 기반 근사값으로 폴백합니다.

## 알려진 한계 / 향후 개선

- 전국 분포 지도 좌표는 `npm run fetch:coords`로 KTO API 실좌표를 `data/poi_coords.json`에 캐시할 수 있습니다. 캐시 미실행·조회 실패 POI는 **시도 중심점 기반 결정적 분산값**으로 폴백합니다.
- 배출계수·접근성·연계성 가중치는 가정값입니다(P3 로직). 실제 대중교통/주변 POI 데이터 연동 시 정교화됩니다.

## 수동 테스트 체크리스트

- P0: 시도/대분류 필터 변경 시 KPI·지도·Top10·도넛·월별 추이가 함께 갱신되는지
- P1: 시도→시군구→POI 선택 시 사진/비교 막대/월별 추이/순위가 바뀌는지, 지도 마커 클릭으로 POI 전환되는지
- P2: 대분류 선택 시 중분류 옵션이 종속 변경되고 전년 대비 증감률이 계산되는지
- P3: 지역 필터에 따라 산점도/추천 등급/지도가 갱신되는지
- P4: 시도 변경 시 탄소수준·코스·유사 POI 사진이 갱신되는지
- P5: 데이터 범위·배출계수표가 실제 데이터와 일치하는지
```
