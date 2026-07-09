import { NextResponse } from "next/server";
import { getPoiMonthly } from "@/lib/server-data";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(getPoiMonthly(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
