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
}

interface Props {
  points: MapPoint[];
  height?: number | string;
  center?: [number, number];
  zoom?: number;
  /** 색상 기준 최대 배출량 (없으면 자동) */
  maxEmission?: number;
  /** 저줌에서 포인트 클러스터링 (전국 지도 등) */
  cluster?: boolean;
  onSelect?: (id: string) => void;
}

/** OpenFreeMap Liberty — 도로·지명이 있는 무료 벡터 베이스맵 */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

function toGeoJSON(points: MapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      properties: {
        id: p.id ?? "",
        name: p.name,
        sub: p.sub ?? "",
        emission: p.emission,
        visitors: p.visitors,
        highlight: p.highlight ? 1 : 0,
      },
    })),
  };
}

export function MapView({
  points,
  height = 380,
  center = [127.8, 36.2],
  zoom = 5.7,
  maxEmission,
  cluster = false,
  onSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const clusterRef = useRef(cluster);
  onSelectRef.current = onSelect;
  clusterRef.current = cluster;

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

      map.on("load", () => {
        if (!map) return;
        const max = maxEmission ?? Math.max(1, ...points.map((p) => p.emission));

        map.addSource("pois", {
          type: "geojson",
          data: toGeoJSON(points),
          ...(clusterRef.current
            ? { cluster: true, clusterMaxZoom: 12, clusterRadius: 52 }
            : {}),
        });

        if (clusterRef.current) {
          map.addLayer({
            id: "poi-clusters",
            type: "circle",
            source: "pois",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step", ["get", "point_count"],
                "#4B83E5", 25, "#7A72D8", 80, "#E09A3E", 200, "#D64545",
              ],
              "circle-radius": [
                "step", ["get", "point_count"],
                16, 25, 22, 80, 28, 200, 34,
              ],
              "circle-opacity": 0.88,
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#ffffff",
            },
          });
          map.addLayer({
            id: "poi-cluster-count",
            type: "symbol",
            source: "pois",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
            },
            paint: { "text-color": "#ffffff" },
          });
        }

        map.addLayer({
          id: "poi-circles",
          type: "circle",
          source: "pois",
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["get", "visitors"],
              0, 4, 1e5, 10, 1e6, 16,
            ],
            "circle-color": [
              "interpolate", ["linear"], ["get", "emission"],
              0, "#4B83E5",
              max * 0.15, "#6FD3A7",
              max * 0.35, "#7A72D8",
              max * 0.55, "#E09A3E",
              max * 0.8, "#D64545",
            ],
            "circle-opacity": 0.85,
            "circle-stroke-width": ["case", ["==", ["get", "highlight"], 1], 2.5, 0.8],
            "circle-stroke-color": ["case", ["==", ["get", "highlight"], 1], "#0B5A4A", "#ffffff"],
          },
        });
        if (clusterRef.current) {
          map.setFilter("poi-circles", ["!", ["has", "point_count"]]);
        }

        const showPopup = (e: MapLayerMouseEvent) => {
          map!.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f || f.properties?.point_count) return;
          const p = f.properties as Record<string, string>;
          const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates.slice() as [number, number];
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

        map.on("mouseenter", "poi-circles", showPopup);
        map.on("mouseleave", "poi-circles", () => {
          map!.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("click", "poi-circles", (e) => {
          const id = e.features?.[0]?.properties?.id as string;
          if (id && onSelectRef.current) onSelectRef.current(id);
        });

        if (clusterRef.current) {
          map.on("click", "poi-clusters", async (e) => {
            const features = map!.queryRenderedFeatures(e.point, { layers: ["poi-clusters"] });
            const clusterId = features[0]?.properties?.cluster_id as number | undefined;
            const src = map!.getSource("pois") as GeoJSONSource;
            if (clusterId == null) return;
            const zoomTo = await src.getClusterExpansionZoom(clusterId);
            const coords = (features[0].geometry as unknown as { coordinates: [number, number] }).coordinates;
            map!.easeTo({ center: coords, zoom: zoomTo });
          });
          map.on("mouseenter", "poi-clusters", () => {
            map!.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "poi-clusters", () => {
            map!.getCanvas().style.cursor = "";
          });
        }

        readyRef.current = true;
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

  // 데이터 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource("pois") as GeoJSONSource | undefined;
    if (src) src.setData(toGeoJSON(points));
  }, [points]);

  // 선택 POI 변경 시 카메라 이동
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !center) return;
    map.easeTo({ center, zoom, duration: 600 });
  }, [center?.[0], center?.[1], zoom]);

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
