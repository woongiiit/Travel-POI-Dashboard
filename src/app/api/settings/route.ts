import { NextResponse } from "next/server";
import {
  settingsPublicView,
  writeLocalSettings,
  type LocalSettings,
} from "@/lib/local-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(settingsPublicView());
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    ktoServiceKey?: string;
    ktoApiBase?: string;
    hfApiKey?: string;
    hfModel?: string;
    hfTemperature?: string;
    tavilyApiKey?: string;
  };

  const patch: LocalSettings = {};
  if (typeof body.ktoServiceKey === "string") patch.KTO_SERVICE_KEY = body.ktoServiceKey;
  if (typeof body.ktoApiBase === "string") patch.KTO_API_BASE = body.ktoApiBase;
  if (typeof body.hfApiKey === "string") patch.HUGGINGFACE_API_KEY = body.hfApiKey;
  if (typeof body.hfModel === "string") patch.HUGGINGFACE_MODEL = body.hfModel;
  if (typeof body.hfTemperature === "string") patch.HUGGINGFACE_TEMPERATURE = body.hfTemperature;
  if (typeof body.tavilyApiKey === "string") patch.TAVILY_API_KEY = body.tavilyApiKey;

  writeLocalSettings(patch);
  return NextResponse.json({ ok: true, settings: settingsPublicView() });
}
