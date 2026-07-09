import { NextResponse } from "next/server";
import { getPoiDetail } from "@/lib/kto";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const detail = await getPoiDetail(id);
  return NextResponse.json(detail, {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
