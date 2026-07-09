"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type { Meta, Poi } from "@/lib/types";

interface DatasetState {
  meta: Meta | null;
  pois: Poi[];
  loading: boolean;
  error: string | null;
  loadMonthly: () => Promise<Record<string, number[]>>;
}

const Ctx = createContext<DatasetState | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const monthlyRef = useRef<Record<string, number[]> | null>(null);
  const monthlyPromise = useRef<Promise<Record<string, number[]>> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/dataset")
      .then((r) => {
        if (!r.ok) throw new Error("데이터를 불러오지 못했습니다.");
        return r.json();
      })
      .then((d: { meta: Meta; pois: Poi[] }) => {
        if (!alive) return;
        setMeta(d.meta);
        setPois(d.pois);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message ?? "오류가 발생했습니다.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadMonthly = useCallback(async () => {
    if (monthlyRef.current) return monthlyRef.current;
    if (!monthlyPromise.current) {
      monthlyPromise.current = fetch("/api/monthly")
        .then((r) => r.json())
        .then((d: Record<string, number[]>) => {
          monthlyRef.current = d;
          return d;
        });
    }
    return monthlyPromise.current;
  }, []);

  return (
    <Ctx.Provider value={{ meta, pois, loading, error, loadMonthly }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDataset(): DatasetState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDataset must be used within DataProvider");
  return ctx;
}
