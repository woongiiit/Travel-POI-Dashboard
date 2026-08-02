"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { fmtInt, fmtEmission } from "@/lib/format";

export interface MapPoint {
  id?: string;
  lon: number;
  lat: number;
  name: string;
  sub?: string;
  emission: number;
  visitors: number;
  /** 강조 표시 */
  highlight?: boolean;
  /** 집계 버블용 POI 개수 (overview) */
  count?: number;
  /** 미리 계산한 원 반지름(px). 표현식 오류 회피용 */
  radius?: number;
}

interface Props {
  points: MapPoint[];
  height?: number | string;
  center?: [number, number];
  zoom?: number;
  /** SW·NE 좌표. 있으면 fitBounds로 카메라 이동 (시도·시군구 필터 등) */
  bounds?: [[number, number], [number, number]] | null;
  /** fitBounds 최대 줌 (시군구는 높게, 시도는 낮게) */
  fitMaxZoom?: number;
  /** fitBounds 최소 줌 — 좁은 지도 패널에서도 시군구가 너무 축소되지 않도록 */
  fitMinZoom?: number;
  /** 색상 기준 최대 배출량 (없으면 자동) */
  maxEmission?: number;
  /**
   * 전국 축소 뷰용 요약 포인트 (시도 집계 등).
   * 있으면 개별 POI 대신 큰 원만 표시 — 확대해도 점 폭탄을 피함.
   * 지역 필터로 null이 되면 개별 points를 표시.
   */
  overviewPoints?: MapPoint[] | null;
  /** 요약 원 클릭 (예: 시도 필터 적용) */
  onOverviewSelect?: (id: string) => void;
  onSelect?: (id: string) => void;
}

const KOREA_CENTER: [number, number] = [127.8, 36.2];
const KOREA_ZOOM = 5.7;

/** OpenFreeMap Liberty — 도로·지명이 있는 무료 벡터 베이스맵 */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

const POI_LAYER_IDS = ["poi-overview", "poi-circles"] as const;

function toGeoJSON(points: MapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points
      .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
      .map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id ?? "",
          name: p.name,
          sub: p.sub ?? "",
          emission: p.emission,
          visitors: p.visitors,
          highlight: p.highlight ? 1 : 0,
          count: p.count ?? 0,
          radius: p.radius ?? 0,
        },
      })),
  };
}

function bringPoiLayersToFront(map: MlMap) {
  for (const id of POI_LAYER_IDS) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

function fitToBounds(
  map: MlMap,
  bounds: [[number, number], [number, number]],
  opts: { maxZoom: number; minZoom?: number; duration?: number },
) {
  const cam = map.cameraForBounds(bounds, {
    padding: 48,
    maxZoom: opts.maxZoom,
  });
  if (!cam) {
    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: opts.maxZoom,
      duration: opts.duration ?? 700,
      essential: true,
    });
    return;
  }
  const zoom = Math.min(opts.maxZoom, Math.max(cam.zoom ?? opts.maxZoom, opts.minZoom ?? 0));
  map.easeTo({
    center: cam.center,
    zoom,
    bearing: cam.bearing ?? 0,
    duration: opts.duration ?? 700,
    essential: true,
  });
}

function emissionColorExpr(max: number) {
  return [
    "interpolate",
    ["linear"],
    ["get", "emission"],
    0,
    "#4B83E5",
    max * 0.15,
    "#6FD3A7",
    max * 0.35,
    "#7A72D8",
    max * 0.55,
    "#E09A3E",
    max * 0.8,
    "#D64545",
  ] as never;
}

export function MapView({
  points,
  height = 380,
  center = KOREA_CENTER,
  zoom = KOREA_ZOOM,
  bounds = null,
  fitMaxZoom = 12,
  fitMinZoom = 0,
  maxEmission,
  overviewPoints = null,
  onOverviewSelect,
  onSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onOverviewSelectRef = useRef(onOverviewSelect);
  const maxEmissionRef = useRef(maxEmission);
  const boundsRef = useRef(bounds);
  const fitMaxZoomRef = useRef(fitMaxZoom);
  const fitMinZoomRef = useRef(fitMinZoom);
  const overviewRef = useRef(overviewPoints);
  onSelectRef.current = onSelect;
  onOverviewSelectRef.current = onOverviewSelect;
  maxEmissionRef.current = maxEmission;
  boundsRef.current = bounds;
  fitMaxZoomRef.current = fitMaxZoom;
  fitMinZoomRef.current = fitMinZoom;
  overviewRef.current = overviewPoints;

  useEffect(() => {
    let map: MlMap | null = null;
    let disposed = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !ref.current) return;
      map = new maplibregl.Map({
        container: ref.current,
        style: STYLE,
        center,
        zoom,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

      const addPoiLayers = () => {
        if (!map || map.getSource("pois")) return;

        const initialOverview = overviewRef.current;
        const useOverview = !!(initialOverview && initialOverview.length > 0);
        const detail = useOverview ? [] : points;
        const max =
          maxEmissionRef.current ??
          Math.max(
            1,
            ...(useOverview ? initialOverview! : points).map((p) => p.emission),
            1,
          );

        map.addSource("pois-overview", {
          type: "geojson",
          data: toGeoJSON(initialOverview ?? []),
        });
        map.addSource("pois", {
          type: "geojson",
          data: toGeoJSON(detail),
        });

        // 시도 요약 — 큰 원
        map.addLayer({
          id: "poi-overview",
          type: "circle",
          source: "pois-overview",
          layout: {
            visibility: useOverview ? "visible" : "none",
          },
          paint: {
            "circle-radius": ["get", "radius"],
            "circle-color": emissionColorExpr(max),
            "circle-opacity": 0.82,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        // 개별 POI
        map.addLayer({
          id: "poi-circles",
          type: "circle",
          source: "pois",
          layout: {
            visibility: useOverview ? "none" : "visible",
          },
          paint: {
            "circle-radius": ["get", "radius"],
            "circle-color": emissionColorExpr(max),
            "circle-opacity": 0.88,
            "circle-stroke-width": ["case", ["==", ["get", "highlight"], 1], 2.5, 1],
            "circle-stroke-color": ["case", ["==", ["get", "highlight"], 1], "#0B5A4A", "#ffffff"],
          },
        });

        bringPoiLayersToFront(map);

        const showPoiPopup = (e: MapLayerMouseEvent) => {
          map!.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string>;
          const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates.slice() as [
            number,
            number,
          ];
          const clickHint = onSelectRef.current
            ? `<br/><span style="color:#4B83E5;font-size:11px">클릭하면 상세 화면으로 이동</span>`
            : "";
          popup
            .setLngLat(coords)
            .setHTML(
              `<strong>${p.name}</strong>${p.sub ? `<br/><span style="color:#718096">${p.sub}</span>` : ""}` +
                `<br/>탄소배출 <b>${fmtEmission(Number(p.emission))}</b> tCO₂e` +
                `<br/>방문자 ${fmtInt(Number(p.visitors))}명` +
                clickHint,
            )
            .addTo(map!);
        };

        const showOverviewPopup = (e: MapLayerMouseEvent) => {
          map!.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string>;
          const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates.slice() as [
            number,
            number,
          ];
          const hint = onOverviewSelectRef.current
            ? `<br/><span style="color:#4B83E5;font-size:11px">클릭하면 이 지역으로 필터</span>`
            : "";
          popup
            .setLngLat(coords)
            .setHTML(
              `<strong>${p.name}</strong>` +
                `<br/><span style="color:#718096">POI ${fmtInt(Number(p.count))}곳</span>` +
                `<br/>탄소배출 <b>${fmtEmission(Number(p.emission))}</b> tCO₂e` +
                `<br/>방문자 ${fmtInt(Number(p.visitors))}명` +
                hint,
            )
            .addTo(map!);
        };

        map.on("mouseenter", "poi-circles", showPoiPopup);
        map.on("mouseleave", "poi-circles", () => {
          map!.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("click", "poi-circles", (e) => {
          const id = e.features?.[0]?.properties?.id as string;
          if (id && onSelectRef.current) onSelectRef.current(id);
        });

        map.on("mouseenter", "poi-overview", showOverviewPopup);
        map.on("mouseleave", "poi-overview", () => {
          map!.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("click", "poi-overview", (e) => {
          const id = e.features?.[0]?.properties?.id as string;
          if (id && onOverviewSelectRef.current) onOverviewSelectRef.current(id);
        });

        readyRef.current = true;
        const b = boundsRef.current;
        if (b) {
          fitToBounds(map, b, {
            maxZoom: fitMaxZoomRef.current,
            minZoom: fitMinZoomRef.current,
            duration: 0,
          });
        }
      };

      map.on("load", () => {
        addPoiLayers();
      });
      map.on("styledata", () => {
        if (map?.getSource("pois")) bringPoiLayersToFront(map);
      });
    })();

    return () => {
      disposed = true;
      readyRef.current = false;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 개별 / 요약 데이터·표시 모드 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    const useOverview = !!(overviewPoints && overviewPoints.length > 0);
    const overviewSrc = map.getSource("pois-overview") as GeoJSONSource | undefined;
    const poiSrc = map.getSource("pois") as GeoJSONSource | undefined;

    if (overviewSrc) overviewSrc.setData(toGeoJSON(overviewPoints ?? []));
    if (poiSrc) poiSrc.setData(toGeoJSON(useOverview ? [] : points));

    const visOverview = useOverview ? "visible" : "none";
    const visDetail = useOverview ? "none" : "visible";
    if (map.getLayer("poi-overview")) map.setLayoutProperty("poi-overview", "visibility", visOverview);
    if (map.getLayer("poi-circles")) map.setLayoutProperty("poi-circles", "visibility", visDetail);

    // 색상 스케일 갱신
    const palette = useOverview ? overviewPoints! : points;
    const max = maxEmission ?? Math.max(1, ...palette.map((p) => p.emission), 1);
    const color = emissionColorExpr(max);
    if (map.getLayer("poi-overview")) map.setPaintProperty("poi-overview", "circle-color", color);
    if (map.getLayer("poi-circles")) map.setPaintProperty("poi-circles", "circle-color", color);

    bringPoiLayersToFront(map);
  }, [points, overviewPoints, maxEmission]);

  // 지역 필터 → bounds 맞춤 / 전국·POI 선택 → center·zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (bounds) {
      fitToBounds(map, bounds, {
        maxZoom: fitMaxZoom,
        minZoom: fitMinZoom,
        duration: 700,
      });
      return;
    }
    if (center) {
      map.easeTo({ center, zoom: zoom ?? KOREA_ZOOM, duration: 600 });
    }
  }, [
    bounds?.[0]?.[0],
    bounds?.[0]?.[1],
    bounds?.[1]?.[0],
    bounds?.[1]?.[1],
    fitMaxZoom,
    fitMinZoom,
    center?.[0],
    center?.[1],
    zoom,
  ]);

  return (
    <div
      ref={ref}
      className="map-wrap"
      style={{
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}
