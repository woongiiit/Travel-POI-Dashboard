# -*- coding: utf-8 -*-
"""
KT 통신데이터 기반 POI 방문자 엑셀 -> 대시보드용 집계 JSON 빌드.

산출물 (data/):
  - factors.json        : 중분류별 1인당 탄소배출계수(앱과 공유)
  - meta.json           : 필터 목록, 전국 KPI, 카테고리/지역 롤업, 월별 추이, Top
  - pois.json           : POI별 집계 (방문자/배출량/현지인·외지인/지도 좌표 폴백)
  - poi_monthly.json    : POI별 월별 방문자 시계열 (ymList 정렬)

탄소배출량(tCO2e) = Σ(월별 방문자수 × 중분류 배출계수[kgCO2e/인]) / 1000
"""
import openpyxl, json, os, hashlib, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "참고자료", "(kt)관광지_현지인_외지인.xlsx")
OUT = os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)

with open(os.path.join(ROOT, "scripts", "factors.json"), encoding="utf-8") as f:
    FCONF = json.load(f)
FACTORS = FCONF["factors"]
FDEFAULT = FCONF["default"]
LOW_TH = FCONF["lowCarbonThreshold"]

with open(os.path.join(ROOT, "scripts", "sido_centroids.json"), encoding="utf-8") as f:
    CENTROIDS = json.load(f)

COORDS_PATH = os.path.join(OUT, "poi_coords.json")


def load_poi_coords_cache():
    """data/poi_coords.json — KTO API 배치 조회 캐시."""
    if not os.path.isfile(COORDS_PATH):
        return {}
    with open(COORDS_PATH, encoding="utf-8") as f:
        return json.load(f).get("coords", {})


POI_COORDS = load_poi_coords_cache()


def factor(mcls):
    return FACTORS.get(mcls, FDEFAULT)


def jitter_coord(sido, cont_id):
    """시도 중심점 기준 결정적 분산 좌표(지도 폴백)."""
    base = CENTROIDS.get(sido, [127.7, 36.5])
    h = hashlib.md5((sido + str(cont_id)).encode("utf-8")).hexdigest()
    a = int(h[0:8], 16) / 0xFFFFFFFF
    b = int(h[8:16], 16) / 0xFFFFFFFF
    spread = 0.55
    return [round(base[0] + (a - 0.5) * spread, 5),
            round(base[1] + (b - 0.5) * spread, 5)]


def resolve_coord(sido, cont_id):
    """KTO 캐시 우선, 없으면 시도 중심 jitter 폴백."""
    entry = POI_COORDS.get(str(cont_id))
    if entry and entry.get("source") == "kto":
        lon, lat = entry.get("lon"), entry.get("lat")
        if lon is not None and lat is not None:
            return round(float(lon), 6), round(float(lat), 6)
    lon, lat = jitter_coord(sido, cont_id)
    return lon, lat


print("loading workbook...")
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["result"]

ym_set = set()
sido_set = set()
sgg_by_sido = {}
lcls_set = set()
mcls_by_lcls = {}

pois = {}          # cont_id -> aggregate
poi_monthly = {}   # cont_id -> {ym: visitors}

it = ws.iter_rows(values_only=True)
next(it)  # header
cnt = 0
for row in it:
    base_ym, cont_id, cont_nm, nati, sido, sgg, lcls, mcls, scls, s = row
    if cont_id is None:
        continue
    cnt += 1
    s = float(s or 0)
    ym_set.add(base_ym)
    sido_set.add(sido)
    sgg_by_sido.setdefault(sido, set()).add(sgg)
    lcls_set.add(lcls)
    mcls_by_lcls.setdefault(lcls, set()).add(mcls)

    p = pois.get(cont_id)
    if p is None:
        p = {
            "id": cont_id, "nm": cont_nm, "sido": sido, "sgg": sgg,
            "lcls": lcls, "mcls": mcls, "scls": scls,
            "v": 0.0, "vL": 0.0, "vO": 0.0,
        }
        pois[cont_id] = p
        poi_monthly[cont_id] = {}
    p["v"] += s
    if nati == "현지인":
        p["vL"] += s
    else:
        p["vO"] += s
    poi_monthly[cont_id][base_ym] = poi_monthly[cont_id].get(base_ym, 0.0) + s

    if cnt % 100000 == 0:
        print("  rows:", cnt)

wb.close()
print("rows total:", cnt, "pois:", len(pois))
kto_coords = sum(1 for c in POI_COORDS.values() if c.get("source") == "kto")
print(f"coord cache: kto={kto_coords} (poi_coords.json), jitter fallback for the rest")

ym_list = sorted(ym_set)

# ---- POI 배출량 및 좌표 폴백 ----
poi_list = []
poi_monthly_out = {}
for cid, p in pois.items():
    f = factor(p["mcls"])
    p["e"] = round(p["v"] * f / 1000.0, 2)           # tCO2e
    p["pc"] = round(f, 3)                              # 1인당 kgCO2e
    p["lon"], p["lat"] = resolve_coord(p["sido"], cid)
    p["v"] = round(p["v"], 1)
    p["vL"] = round(p["vL"], 1)
    p["vO"] = round(p["vO"], 1)
    poi_list.append(p)
    poi_monthly_out[cid] = [round(poi_monthly[cid].get(y, 0.0), 1) for y in ym_list]

# ---- 전국 월별 추이 ----
nat_month_v = {y: 0.0 for y in ym_list}
nat_month_e = {y: 0.0 for y in ym_list}
for cid, p in pois.items():
    f = factor(p["mcls"])
    for y in ym_list:
        v = poi_monthly[cid].get(y, 0.0)
        nat_month_v[y] += v
        nat_month_e[y] += v * f / 1000.0
national_monthly = [
    {"ym": y, "visitors": round(nat_month_v[y], 0), "emission": round(nat_month_e[y], 1)}
    for y in ym_list
]

# ---- 카테고리 롤업 ----
lcls_roll = {}
mcls_roll = {}
for p in poi_list:
    l = lcls_roll.setdefault(p["lcls"], {"lcls": p["lcls"], "visitors": 0.0, "emission": 0.0, "nPoi": 0})
    l["visitors"] += p["v"]; l["emission"] += p["e"]; l["nPoi"] += 1
    m = mcls_roll.setdefault(p["mcls"], {"mcls": p["mcls"], "lcls": p["lcls"], "visitors": 0.0, "emission": 0.0, "nPoi": 0})
    m["visitors"] += p["v"]; m["emission"] += p["e"]; m["nPoi"] += 1

total_e = sum(p["e"] for p in poi_list)
total_v = sum(p["v"] for p in poi_list)

lcls_rollup = sorted(lcls_roll.values(), key=lambda x: -x["emission"])
for x in lcls_rollup:
    x["emission"] = round(x["emission"], 1)
    x["visitors"] = round(x["visitors"], 0)
    x["share"] = round(x["emission"] / total_e * 100, 1) if total_e else 0
mcls_rollup = sorted(mcls_roll.values(), key=lambda x: -x["emission"])
for x in mcls_rollup:
    x["emission"] = round(x["emission"], 1)
    x["visitors"] = round(x["visitors"], 0)
    x["share"] = round(x["emission"] / total_e * 100, 1) if total_e else 0

# ---- 지역 롤업 ----
sido_roll = {}
sgg_roll = {}
for p in poi_list:
    s = sido_roll.setdefault(p["sido"], {"sido": p["sido"], "visitors": 0.0, "emission": 0.0, "nPoi": 0})
    s["visitors"] += p["v"]; s["emission"] += p["e"]; s["nPoi"] += 1
    key = p["sido"] + "|" + p["sgg"]
    g = sgg_roll.setdefault(key, {"sido": p["sido"], "sgg": p["sgg"], "visitors": 0.0, "emission": 0.0, "nPoi": 0})
    g["visitors"] += p["v"]; g["emission"] += p["e"]; g["nPoi"] += 1
for x in sido_roll.values():
    x["emission"] = round(x["emission"], 1); x["visitors"] = round(x["visitors"], 0)
    x["lon"], x["lat"] = CENTROIDS.get(x["sido"], [127.7, 36.5])
for x in sgg_roll.values():
    x["emission"] = round(x["emission"], 1); x["visitors"] = round(x["visitors"], 0)
sido_rollup = sorted(sido_roll.values(), key=lambda x: -x["emission"])
sgg_rollup = sorted(sgg_roll.values(), key=lambda x: -x["emission"])

# ---- KPI ----
n_months = len(ym_list)
total_e_kg = total_e * 1000.0
low_carbon = [p for p in poi_list if p["pc"] <= LOW_TH]
top10 = sorted(poi_list, key=lambda x: -x["e"])[:10]
top10_e = sum(p["e"] for p in top10)

kpis = {
    "nPoi": len(poi_list),
    "totalVisitors": round(total_v, 0),
    "totalEmission": round(total_e, 0),                       # tCO2e
    "perPoiAvgKg": round(total_e_kg / len(poi_list) / n_months, 1),  # POI당 월평균 kgCO2e
    "perCapitaKg": round(total_e_kg / total_v, 2) if total_v else 0,  # 1인당 평균
    "top10Share": round(top10_e / total_e * 100, 1) if total_e else 0,
    "lowCarbonCount": len(low_carbon),
    "nSido": len(sido_set),
    "nSgg": len(sgg_roll),
}

meta = {
    "ymList": ym_list,
    "ymMin": ym_list[0], "ymMax": ym_list[-1], "nMonths": n_months,
    "updatedAt": "2026-06-06",
    "filters": {
        "sido": sorted(sido_set),
        "sggBySido": {k: sorted(v) for k, v in sgg_by_sido.items()},
        "lcls": sorted(lcls_set),
        "mclsByLcls": {k: sorted(v) for k, v in mcls_by_lcls.items()},
        "nati": ["전체", "현지인", "외지인"],
    },
    "kpis": kpis,
    "national_monthly": national_monthly,
    "lclsRollup": lcls_rollup,
    "mclsRollup": mcls_rollup,
    "sidoRollup": sido_rollup,
    "sggRollup": sgg_rollup,
    "top10": [{"id": p["id"], "nm": p["nm"], "sido": p["sido"], "sgg": p["sgg"],
               "visitors": p["v"], "emission": p["e"]} for p in top10],
}

# ---- POI 저장(경량) ----
pois_out = [{
    "id": p["id"], "nm": p["nm"], "sido": p["sido"], "sgg": p["sgg"],
    "lcls": p["lcls"], "mcls": p["mcls"], "scls": p["scls"],
    "v": p["v"], "vL": p["vL"], "vO": p["vO"], "e": p["e"], "pc": p["pc"],
    "lon": p["lon"], "lat": p["lat"],
} for p in sorted(poi_list, key=lambda x: -x["e"])]


def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", name, round(os.path.getsize(path) / 1024 / 1024, 2), "MB")


dump("factors.json", {"factors": FACTORS, "default": FDEFAULT, "lowCarbonThreshold": LOW_TH})
dump("meta.json", meta)
dump("pois.json", pois_out)
dump("poi_monthly.json", poi_monthly_out)
print("KPIs:", json.dumps(kpis, ensure_ascii=False))
print("DONE")
