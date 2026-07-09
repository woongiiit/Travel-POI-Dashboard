import { NextResponse } from "next/server";
import { getMeta, getPois } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export function GET() {
  const cacheControl =
    process.env.NODE_ENV === "development"
      ? "no-store"
      : "public, max-age=3600";
  return NextResponse.json(
    { meta: getMeta(), pois: getPois() },
    { headers: { "Cache-Control": cacheControl } },
  );
}
