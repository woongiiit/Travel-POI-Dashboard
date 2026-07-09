# 프로젝트 작업 이력 (HISTORY)

> **용도**: 사용자 요청과 그에 따른 코드/설정 변경 내역을 누적 기록합니다.  
> 향후 AI 세션에서 이 파일을 **먼저 읽고** 맥락·결정·제약을 파악한 뒤 작업합니다 (RAG 대체).

---

## AI 사용 가이드

1. 새 요청 처리 전 `HISTORY.md` + `README.md`를 참조한다.
2. 작업 완료 후 **본 파일 하단에 새 항목을 추가**한다 (아래 [기록 템플릿](#기록-템플릿) 사용).
3. 각 항목에 **키워드**, **변경 파일**, **중요 결정/제약**을 반드시 남긴다.
4. 사용자가 명시적으로 되돌리지 않은 결정은 유지한다.

### 기록 템플릿

```markdown
### [YYYY-MM-DD] 요청 요약 (한 줄)

**요청**: (사용자 원문 요약)

**변경**:
- (bullet로 변경 내용)

**파일**:
- `path/to/file`

**키워드**: `tag1`, `tag2`

**비고**: (알려진 제약, 미해결 이슈, 후속 작업)
```

---

## 프로젝트 기준 정보 (Baseline)

| 항목 | 내용 |
| --- | --- |
| 프로젝트명 | 탄소중립 관광 대시보드 (`carbon-tourism-dashboard`) |
| 스택 | Next.js 15 App Router, React 19, TypeScript, ECharts, MapLibre GL |
| 데이터 | KT 통신 POI 엑셀 → `scripts/build_data.py` → `data/*.json` |
| POI 상세 | 한국관광공사 KorService2 GW `detailCommon2` (`contentId`) |
| 환경변수 | `.env.local` → `KTO_SERVICE_KEY` (디코딩 키) |
| 페이지 | P0 `/`, P1 `/region`, P2 `/category`, P3 `/discover`, P4 `/guide`, P5 `/method` |
| 시안 | `참고자료/2차 대시보드 개발.pdf` |

### 핵심 아키텍처 결정

- **탄소배출량**: `방문자수 × 중분류 배출계수(kgCO₂e/인) / 1000` — 계수는 `scripts/factors.json` 가정값
- **전국 지도 좌표**: 시도 중심 + 결정적 분산 (실좌표 없음). P1 상세는 KTO API 좌표 우선
- **KTO API**: KorService2는 `contentId`만 전송 (구 KorService1의 `defaultYN`, `addrinfoYN` 등 **사용 금지**)
- **사이드바**: 접기 상태 `localStorage` 키 `sidebar-collapsed`

### 알려진 제약

- 일부 POI는 KTO DB에 `firstimage` 없음 → API 성공해도 placeholder 아이콘 표시 (정상)
- fallback API 응답은 캐시하지 않음 (`src/lib/kto.ts`)
- git 저장소 미초기화 상태 (2026-06-28 기준)

---

## 작업 이력

### [2026-06-06] 대시보드 초안 개발

**요청**: `./참고자료` POI 엑셀 분석 + PDF 시안 기반 대시보드 초안. POI 사진은 한국관광공사 API. Next.js 15 + React 19 + TS, ECharts + MapLibre.

**변경**:
- 엑셀(690,365행) 분석 → POI 8,588개, 41개월, 17시도, 252시군구 확인
- `scripts/build_data.py`, `scripts/factors.json`, `scripts/sido_centroids.json` — 데이터 파이프라인 구축
- `data/meta.json`, `data/pois.json`, `data/poi_monthly.json` 생성
- Next.js 앱 전체 구조: P0~P5 페이지, API 라우트, 공통 레이아웃/필터/차트/지도
- `src/lib/kto.ts` — KorService2 `detailCommon2` 연동 (초기에는 구 API 파라미터 포함, 이후 수정)
- `README.md` 작성

**파일** (주요):
- `scripts/build_data.py`, `scripts/factors.json`
- `src/app/page.tsx`, `src/app/region/page.tsx`, `src/app/category/page.tsx`, `src/app/discover/page.tsx`, `src/app/guide/page.tsx`, `src/app/method/page.tsx`
- `src/lib/kto.ts`, `src/lib/server-data.ts`, `src/lib/types.ts`, `src/lib/aggregate.ts`, `src/lib/insights.ts`
- `src/components/Sidebar.tsx`, `MapView.tsx`, `FilterBar.tsx`, `DataProvider.tsx`, `charts/EChart.tsx`
- `src/app/api/dataset/route.ts`, `src/app/api/monthly/route.ts`, `src/app/api/poi/[id]/route.ts`

**키워드**: `초기개발`, `P0-P5`, `데이터파이프라인`, `시안`, `KT통신데이터`

**비고**: 배출계수·접근성 가중치는 가정값. 전국 지도는 시도 중심 근사 좌표 사용.

---

### [2026-06-06] KTO API 데이터 미수신 원인 수정

**요청**: API 키 검증 완료했는데도 POI 사진/상세가 fallback으로 표시됨. [공공데이터포털 detailCommon2](https://www.data.go.kr/data/15101578/openapi.do#/API%20%EB%AA%A9%EB%A1%9D/detailCommon2) 스펙 참고.

**변경**:
- **원인**: KorService1 전용 파라미터(`defaultYN`, `addrinfoYN`, `mapinfoYN`, `overviewYN`, `firstImageYN`) 전송 → `INVALID_REQUEST_PARAMETER_ERROR(addrinfoYN)`
- KorService2 GW는 **`contentId` + `MobileOS=WEB` + `MobileApp=APP` + `_type=json`** 만 사용
- `apiError()` 추가 — API 오류 응답 감지 및 로그
- fallback 결과 캐시 제거, 이미지 URL `http` → `https` 변환
- UI 메시지 분리: `fallback`(키/연결 실패) vs `kto` + 이미지 없음(KTO DB 미등록)
- `PoiDetail.error` 필드 추가

**파일**:
- `src/lib/kto.ts`
- `src/lib/types.ts`
- `src/app/region/page.tsx`

**키워드**: `KTO`, `KorService2`, `detailCommon2`, `API버그`, `fallback`, `addrinfoYN`

**비고**:
- `contentId=136088`(영랑호리조트): API 성공, 주소·좌표 있음, **사진 없음** (KTO 미등록 — 정상)
- `contentId=1000981`, `127565`: 사진·주소 정상

---

### [2026-06-06] 개발 서버 기동

**요청**: 개발계( dev server ) 열어줘.

**변경**:
- `npm run dev` 실행 → http://localhost:3000
- `.env.local` 로드 확인 (KTO_SERVICE_KEY 포함)

**키워드**: `dev-server`, `localhost:3000`

---

### [2026-06-06] 사이드바 접기/펼치기 토글 추가

**요청**: 좌측 네비게이션 메뉴바에 접기/펼치기(Toggle) 기능 추가.

**변경**:
- `Sidebar.tsx`: `collapsed` 상태, `localStorage`(`sidebar-collapsed`) 영속화
- 펼침 232px / 접힘 68px, 접힌 상태 아이콘-only + `title` 툴팁
- `globals.css`: `--sidebar-w-collapsed`, 전환 애니메이션, 접힘 시 텍스트·푸터 숨김
- (초기) 하단 « / » 토글 버튼

**파일**:
- `src/components/Sidebar.tsx`
- `src/app/globals.css`

**키워드**: `sidebar`, `toggle`, `collapsed`, `localStorage`

---

### [2026-06-06] 토글 버튼 위치·스타일 변경 (햄버거)

**요청**: 접기 버튼을 "탄소중립 관광 / 데이터 대시보드" **오른쪽**에 햄버거 아이콘으로.

**변경**:
- 토글 버튼을 `sidebar__brand` 영역 우측으로 이동
- 3줄 햄버거(☰) 아이콘, 접힌 상태 X 변환
- 하단 « 접기 버튼 제거
- `sidebar__brand-left` 레이아웃 분리

**파일**:
- `src/components/Sidebar.tsx`
- `src/app/globals.css`

**키워드**: `sidebar`, `hamburger`, `brand-header`

---

### [2026-06-06] 접힘 상태 아이콘: X → 문+화살표

**요청**: 닫혀 있을 때 X 대신 **문 + 화살표**(펼치기) 아이콘으로 변경.

**변경**:
- 접힘: SVG (사각형 + 오른쪽 화살표) — `sidebar__toggle-icon--expand`
- 펼침: 햄버거 3줄 유지 — `sidebar__toggle-burger`
- X → 햄버거 morph CSS 제거

**파일**:
- `src/components/Sidebar.tsx`
- `src/app/globals.css`

**키워드**: `sidebar`, `expand-icon`, `panel-open`

**비고**: 현재 사이드바 UX 확정 상태. 추가 변경 시 이 항목 기준으로 diff.

---

### [2026-06-28] HISTORY.md 생성 — 작업 이력 RAG화

**요청**: 부탁 내용과 수정 내역을 `HISTORY.md`에 기록하고, 향후 요청 시 RAG처럼 참조.

**변경**:
- 프로젝트 루트에 `HISTORY.md` 생성
- AI 사용 가이드, baseline, 2026-06-06~28 작업 이력 역추적 기록
- 이후 모든 작업 완료 시 본 파일에 항목 추가 규칙 수립

**파일**:
- `HISTORY.md`

**키워드**: `HISTORY`, `RAG`, `문서화`, `작업이력`

**비고**: 새 작업마다 이 파일 하단에 [기록 템플릿](#기록-템플릿) 형식으로 추가할 것.

---

### [2026-06-28] 개발 서버 기동

**요청**: 개발서버 열어줘.

**변경**:
- `npm run dev` 실행
- 포트 3000은 기존 프로세스(PID 22848) 사용 중 → **3001**에서 기동
- `.env.local` 로드 확인, `/` 200 응답 확인

**키워드**: `dev-server`, `localhost:3001`, `port-conflict`

**비고**: http://localhost:3000 도 200 응답(이전 인스턴스). 최신 코드 반영은 **3001** 사용 권장.

---

### [2026-06-28] 와이어프레임 페이지 코드(P0~P5) UI 제거

**요청**: P0, P1 등은 개발용 와이어프레임 문서 이름이므로, 페이지에 기재된 해당 글씨 삭제.

**변경**:
- `PageHeader`의 `badge` prop 제거 (P0. ~ P5. 접두 표시 삭제)
- 사이드바 NAV `code` 필드 및 `nav-item__code` 표시 제거
- 접힌 사이드바 툴팁에서 `P0.` 등 접두 제거 → 라벨만 표시

**파일**:
- `src/components/ui.tsx`
- `src/components/Sidebar.tsx`
- `src/app/page.tsx`, `src/app/region/page.tsx`, `src/app/category/page.tsx`, `src/app/discover/page.tsx`, `src/app/guide/page.tsx`, `src/app/method/page.tsx`

**키워드**: `P0-P5`, `와이어프레임`, `PageHeader`, `sidebar`, `UI정리`

**비고**: `README.md`·`HISTORY.md` 등 개발 문서의 P0~P5 참조는 유지 (사용자 요청은 UI 한정).

---

### [2026-06-28] 전체 UI 디자인 시스템 개선

**요청**: 기능 변경 없이 레이아웃·컴포넌트 스타일 개선. 사이드바 딥 틸, Lucide 아이콘, 컬러 시스템 통일, 카드 그림자 완화.

**변경**:
- `globals.css`: 디자인 토큰 재정의 (배경 `#F4F7FA`, 텍스트 `#14263D`, 데이터 블루/탄소 보라/틸·민트)
- 사이드바: `#0B5A4A`~`#124E45` 그라데이션, 활성 메뉴 민트 인디케이터, Lucide 아이콘, 햄버거 버튼 배경 제거
- `lucide-react` 추가, `src/components/icons.tsx` (`AppIcon` 헬퍼)
- `ui.tsx`: KPI `variant` (blue/green/purple/amber/teal/red/neutral), `StatRow`/`InsightBlock` 추가
- KPI·필터·카드 제목에서 이모지 제거 → Lucide 단색 아이콘
- `categories.ts`·`charts.ts`·`MapView.tsx`: 의미 기반 컬러 (방문자=블루, 배출=보라, 저탄소=그린)
- 카드: `border + box-shadow: 0 2px 8px rgba(15,35,55,0.05)`, hover 시만 강조

**파일** (주요):
- `src/app/globals.css`, `src/components/Sidebar.tsx`, `src/components/ui.tsx`, `src/components/FilterBar.tsx`, `src/components/icons.tsx`, `src/components/PoiPhoto.tsx`
- `src/lib/categories.ts`, `src/lib/charts.ts`, `src/components/MapView.tsx`
- `src/app/page.tsx`, `region/page.tsx`, `category/page.tsx`, `discover/page.tsx`, `guide/page.tsx`, `method/page.tsx`
- `package.json` (`lucide-react`)

**키워드**: `UI개선`, `디자인시스템`, `lucide`, `사이드바`, `컬러토큰`, `카드`

**비고**: 비즈니스 로직·API·필터·라우팅 변경 없음. `npm run build` 성공.

---

### [2026-06-28] lucide-react vendor-chunks 런타임 오류 수정

**요청**: `Cannot find module './vendor-chunks/lucide-react.js'` 원인 진단 및 수정.

**원인**:
- `lucide-react` 추가 후 **dev 서버를 재시작하지 않고** HMR만 적용됨
- `.next/server/app/page.js`는 `vendor-chunks/lucide-react`를 참조하지만, 실제 chunk 파일은 생성되지 않은 **불완전한 캐시** 상태

**변경**:
- 기존 dev 프로세스 종료 + `.next` 폴더 삭제 후 dev 서버 재기동
- `next.config.mjs`에 `experimental.optimizePackageImports: ["lucide-react"]` 추가 (번들 안정화)

**키워드**: `lucide-react`, `vendor-chunks`, `캐시`, `Runtime Error`

**비고**: lucide 추가·대규모 UI 변경 후에는 dev 서버 **완전 재시작** 권장. 현재 http://localhost:3000 정상(200).

---

### [2026-06-28] 사이드바 배경색 변경

**요청**: 좌측 네비게이션 메뉴바 색상을 `#6a8a5e`로 설정.

**변경**:
- `--sidebar-bg: #6a8a5e`, `--sidebar-bg-alt: #5f7f54` (그라데이션 하단)

**파일**: `src/app/globals.css`

**키워드**: `sidebar`, `#6a8a5e`, `색상`

---

### [2026-06-28] 사이드바 배경색 `#00AAFF` 변경

**요청**: 좌측 네비게이션 메뉴바 색상을 `#00AAFF`로 재설정.

**변경**:
- `--sidebar-bg: #00aaff`, `--sidebar-bg-alt: #0096e0`
- 활성 인디케이터·아이콘 강조: `--sidebar-active: #ffffff` (밝은 배경 대비)

**파일**: `src/app/globals.css`

**키워드**: `sidebar`, `#00AAFF`, `색상`

---

### [2026-06-28] 사이드바 배경색 `#B9E0FD` 변경

**요청**: 좌측 네비게이션 메뉴바 색상을 `#B9E0FD`로 재설정.

**변경**:
- `--sidebar-bg: #b9e0fd`, `--sidebar-bg-alt: #a8d4f5`
- 밝은 배경에 맞춰 텍스트·아이콘을 어두운 톤으로, 활성 인디케이터는 `#0099dd`

**파일**: `src/app/globals.css`

**키워드**: `sidebar`, `#B9E0FD`, `색상`

---

### [2026-06-28] 사이드바 배경색 `#2196F3` 변경

**요청**: 좌측 네비게이션 메뉴바 색상을 `#2196F3`로 재설정.

**변경**:
- `--sidebar-bg: #2196f3`, `--sidebar-bg-alt: #1976d2`
- 중간 톤 블루에 맞춰 텍스트·아이콘 흰색, 활성 인디케이터 `#ffffff`

**파일**: `src/app/globals.css`

**키워드**: `sidebar`, `#2196F3`, `색상`

---

### [2026-06-28] 메인 헤더 기간·업데이트 pill 제거

**요청**: 메인화면 우상단 기간·데이터 업데이트 표시 제거.

**변경**: P0 `PageHeader`의 `right` prop(기간 pill, 데이터 업데이트 pill) 삭제

**파일**: `src/app/page.tsx`

**키워드**: `P0`, `PageHeader`, `기간`, `pill`

---

### [2026-06-28] KTO API POI 실좌표 배치 조회·캐시

**요청**: 전국 POI 분포도 직사각형 클러스터 해결 — 한국관광공사 API 실좌표 조회 방식 설계·구현.

**변경**:
- `scripts/kto_api.py`: KorService2 `detailCommon2` Python 클라이언트
- `scripts/fetch_poi_coords.py`: POI별 좌표 배치 조회 → `data/poi_coords.json` 캐시, `pois.json` 반영(resume 지원)
- `scripts/build_data.py`: `poi_coords.json` 캐시 우선, 없으면 jitter 폴백
- `npm run fetch:coords` 스크립트 추가, README 파이프라인·한계 문구 갱신

**파일**:
- `scripts/kto_api.py`, `scripts/fetch_poi_coords.py`, `scripts/build_data.py`
- `package.json`, `README.md`, `data/poi_coords.json`(fetch 후 생성)

**키워드**: `KTO`, `좌표`, `fetch:coords`, `poi_coords`, `지도`, `jitter`

**비고**: 8,588 POI 전체 조회 시 API rate limit 고려해 `--delay 0.12` 기본. 실패 POI는 jitter 폴백.

---

### [2026-07-06] 사이드바 네비게이션 색상 #CCDA47

**요청**: 좌측 메뉴 네비게이션 색상을 `#CCDA47`로 변경.

**변경**: `globals.css` 사이드바 CSS 변수 — 배경 `#CCDA47` / `#B8C43E` 그라데이션, 밝은 배경에 맞게 텍스트·hover·divider를 어두운 톤으로 조정

**파일**: `src/app/globals.css`

**키워드**: `sidebar`, `#CCDA47`, `색상`

---

### [2026-07-06] 사이드바 메뉴 글씨 색상 #0A3625

**요청**: 메뉴 네비게이션 바 안 글씨 색상 `#0A3625`.

**변경**: `globals.css` `--sidebar-active-text`, `--sidebar-active`, `--sidebar-muted` 등 텍스트 관련 변수를 `#0A3625` 기준으로 통일

**파일**: `src/app/globals.css`

**키워드**: `sidebar`, `#0A3625`, `텍스트`, `색상`

---

### [2026-07-09] KTO areaBasedSyncList2 일괄 좌표 수집

**요청**: detailCommon2 개별 조회(8,588회) 대신 빠른 대안 구현.

**변경**:
- `scripts/kto_api.py`: `areaBasedSyncList2` 페이지 조회·재시도·좌표 파싱
- `scripts/fetch_poi_coords.py`: 기본 `--mode bulk`(~507 API), resume, `--detail-fallback`, `--force-resync`
- README 좌표 파이프라인 문구 갱신

**파일**: `scripts/kto_api.py`, `scripts/fetch_poi_coords.py`, `README.md`

**키워드**: `KTO`, `areaBasedSyncList2`, `bulk`, `fetch:coords`, `좌표`

---

### [2026-07-09] P0 지도 POI 클릭 → 지역 상세 이동

**요청**: 전국 POI 분포도에서 점 클릭 시 해당 POI 지역·상세 화면(P1)으로 이동.

**변경**:
- P0 `MapView` `onSelect` → `/region?poi=&sido=&sgg=` 라우팅
- P1 URL 쿼리 파라미터로 시도·시군구·POI 초기 선택
- `MapView` 툴팁에 클릭 안내 문구 (onSelect 있을 때)

**파일**: `src/app/page.tsx`, `src/app/region/page.tsx`, `src/components/MapView.tsx`

**키워드**: `P0`, `P1`, `MapView`, `지도`, `클릭`, `navigation`

---

### [2026-07-09] P1 POI 사진 클릭 확대(라이트박스)

**요청**: 지역 POI 상세 정보에서 사진 클릭 시 확대 보기.

**변경**: `ImageLightbox` 컴포넌트 추가, P1 썸네일 클릭 → 오버레이 확대 (Esc·배경 클릭으로 닫기)

**파일**: `src/components/ImageLightbox.tsx`, `src/app/region/page.tsx`, `src/app/globals.css`

**키워드**: `P1`, `lightbox`, `사진`, `POI`

---

### [2026-07-09] GitHub 초기 커밋·푸시

**요청**: 지금까지 작업 내용을 `woongiiit/Travel-POI-Dashboard` 저장소에 커밋·업로드.

**변경**: git init, initial commit, `main` 브랜치 push. `.env.local`·`node_modules`·export 임시 파일 제외.

**원격**: https://github.com/woongiiit/Travel-POI-Dashboard

**키워드**: `git`, `github`, `deploy`

---

## 키워드 인덱스

| 키워드 | 관련 항목 |
| --- | --- |
| KTO / API | KTO API 데이터 미수신 원인 수정, KTO POI 실좌표 배치 캐시 |
| sidebar / toggle | 사이드바 토글 3건 (추가 → 햄버거 → 문+화살표) |
| P0-P5 | 대시보드 초안 개발 |
| factors / 탄소 | 초안 개발, `scripts/factors.json` |
| dev-server | 개발 서버 기동 (2026-06-06, 2026-06-28) |
| UI / 디자인 | 전체 UI 디자인 시스템 개선 (2026-06-28) |
