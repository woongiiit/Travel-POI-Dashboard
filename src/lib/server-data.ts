import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Meta, Poi } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const IS_DEV = process.env.NODE_ENV === "development";

function readJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

let _meta: Meta | null = null;
let _pois: Poi[] | null = null;
let _monthly: Record<string, number[]> | null = null;

export function getMeta(): Meta {
  if (IS_DEV) return readJson<Meta>("meta.json");
  if (!_meta) _meta = readJson<Meta>("meta.json");
  return _meta;
}

export function getPois(): Poi[] {
  if (IS_DEV) return readJson<Poi[]>("pois.json");
  if (!_pois) _pois = readJson<Poi[]>("pois.json");
  return _pois;
}

export function getPoiMonthly(): Record<string, number[]> {
  if (IS_DEV) return readJson<Record<string, number[]>>("poi_monthly.json");
  if (!_monthly) _monthly = readJson<Record<string, number[]>>("poi_monthly.json");
  return _monthly;
}

export function getFactors(): { factors: Record<string, number>; default: number; lowCarbonThreshold: number } {
  return readJson("factors.json");
}
