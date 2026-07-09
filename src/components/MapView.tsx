"use client";

import { useEffect, useRef } from "react";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
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
  onSelect?: (id: string) => void;
}

const STYLE = "https://demotiles.maplibre.org/style.json";

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
  onSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

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
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

      map.on("load", () => {
        if (!map) return;
        map.addSource("pois", { type: "geojson", data: toGeoJSON(points) });

        const max = maxEmission ?? Math.max(1, ...points.map((p) => p.emission));
        map.addLayer({
          id: "poi-circles",
          type: "circle",
          source: "pois",
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["get", "visitors"],
              0, 3, max * 1000, 16,
            ],
            "circle-color": [
              "interpolate", ["linear"], ["get", "emission"],
              0, "#4B83E5",
              max * 0.15, "#6FD3A7",
              max * 0.35, "#7A72D8",
              max * 0.55, "#E09A3E",
              max * 0.8, "#D64545",
            ],
            "circle-opacity": 0.82,
            "circle-stroke-width": ["case", ["==", ["get", "highlight"], 1], 2.5, 0.5],
            "circle-stroke-color": ["case", ["==", ["get", "highlight"], 1], "#0B5A4A", "#ffffff"],
          },
        });

        map.on("mouseenter", "poi-circles", (e) => {
          map!.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string>;
          const coords = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
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
        });
        map.on("mouseleave", "poi-circles", () => {
          map!.getCanvas().style.cursor = "";
          popup.remove();
        });
        map.on("click", "poi-circles", (e) => {
          const id = e.features?.[0]?.properties?.id as string;
          if (id && onSelectRef.current) onSelectRef.current(id);
        });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

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
