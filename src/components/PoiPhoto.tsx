"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PoiDetail } from "@/lib/types";

const cache = new Map<string, PoiDetail>();

export function usePoiDetail(id: string | null): { detail: PoiDetail | null; loading: boolean } {
  const [detail, setDetail] = useState<PoiDetail | null>(id ? cache.get(id) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (cache.has(id)) {
      setDetail(cache.get(id)!);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/poi/${id}`)
      .then((r) => r.json())
      .then((d: PoiDetail) => {
        cache.set(id, d);
        if (alive) setDetail(d);
      })
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  return { detail, loading };
}

export function PoiPhoto({
  id,
  fallbackIcon,
  height = 96,
  alt,
}: {
  id: string;
  fallbackIcon?: ReactNode;
  height?: number;
  alt: string;
}) {
  const { detail, loading } = usePoiDetail(id);
  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--panel-2)",
        display: "grid",
        placeItems: "center",
        border: "1px solid var(--border)",
      }}
    >
      {loading ? (
        <div className="spinner" />
      ) : detail?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={detail.image} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        fallbackIcon
      )}
    </div>
  );
}
