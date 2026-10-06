import { NextResponse } from "next/server";
import { getHfConfig, hfChatCompletion, stripReasoning } from "@/lib/hf";
import { getTavilyConfigured, tavilySearch } from "@/lib/tavily";
import type { GuideAiResult } from "@/lib/guide-ai-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface GuideAiRequest {
  scope: string;
  sido: string;
  sgg: string;
  travelerType: string;
  periodLabel: string;
  seasonLabel?: string;
  carbonLevel: string;
  regionPc: number;
  nationalRatioPct: number;
  topCategory?: string;
  course: Array<{ nm: string; mcls: string; sgg: string; pc: number }>;
  similar: Array<{ nm: string; sgg: string; pc: number }>;
  ruleCautions?: string[];
  ruleSuggestions?: string[];
}

function parseJsonBlock(text: string): Partial<GuideAiResult> | null {
  const cleaned = stripReasoning(text);
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? cleaned).trim();

  // 마지막 완전한 { ... } 후보부터 시도
  const candidates: string[] = [];
  if (raw.startsWith("{") && raw.endsWith("}")) candidates.push(raw);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));

  for (const c of candidates) {
    try {
      return JSON.parse(c) as Partial<GuideAiResult>;
    } catch {
      /* continue */
    }
  }

  // 잘린 JSON에서 닫히지 않은 문자열/배열 복구 시도
  if (start >= 0) {
    let frag = raw.slice(start);
    // 열린 문자열 닫기
    const quoteCount = (frag.match(/(?<!\\)"/g) ?? []).length;
    if (quoteCount % 2 === 1) frag += '"';
    // 괄호 맞추기
    const openCurly = (frag.match(/{/g) ?? []).length;
    const closeCurly = (frag.match(/}/g) ?? []).length;
    const openSquare = (frag.match(/\[/g) ?? []).length;
    const closeSquare = (frag.match(/]/g) ?? []).length;
    frag += "]".repeat(Math.max(0, openSquare - closeSquare));
    frag += "}".repeat(Math.max(0, openCurly - closeCurly));
    // trailing comma 제거
    frag = frag.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(frag) as Partial<GuideAiResult>;
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const body = (await req.json()) as GuideAiRequest;
  const hf = getHfConfig();

  if (!hf.configured) {
    return NextResponse.json({
      configured: false,
      source: "fallback",
      usedTavily: false,
      regionSummary: "",
      tips: [],
      courseNote: "",
      cautions: [],
      suggestions: [],
      error: "HUGGINGFACE_API_KEY 미설정 — 규칙 기반 가이드를 표시합니다.",
    } satisfies GuideAiResult);
  }

  let searchHits: Array<{ title: string; url: string; content: string }> = [];
  let usedTavily = false;
  if (getTavilyConfigured()) {
    try {
      const q = `${body.scope} ${body.travelerType} 저탄소 관광 대중교통 친환경 여행`;
      searchHits = await tavilySearch(q, { maxResults: 4 });
      usedTavily = searchHits.length > 0;
    } catch {
      usedTavily = false;
    }
  }

  const courseLines = body.course
    .map((p, i) => `${i + 1}. ${p.nm} (${p.sgg}, ${p.mcls}, ${p.pc.toFixed(2)} kgCO₂e/인)`)
    .join("\n");
  const similarLines = body.similar
    .map((p) => `- ${p.nm} (${p.sgg}, ${p.pc.toFixed(2)} kgCO₂e/인)`)
    .join("\n");
  const webContext = searchHits.length
    ? searchHits.map((h, i) => `[${i + 1}] ${h.title}\n${h.content}\n${h.url}`).join("\n\n")
    : "(웹 검색 결과 없음)";

  const system = `당신은 한국 탄소중립 관광 가이드입니다.
반드시 한국어로 답하세요. 과장·허위 사실을 만들지 마세요.
배출량·POI 순위는 제공된 수치만 사용하세요.
생각 과정·설명·마크다운 코드펜스 없이 JSON 객체만 출력하세요.
reasoning/thinking을 출력하지 마세요.`;

  const user = `아래 맥락으로 여행자 가이드 JSON만 작성하세요.

[지역] ${body.scope}
[여행자 유형] ${body.travelerType}
[기간] ${body.periodLabel}${body.seasonLabel ? ` / ${body.seasonLabel}` : ""}
[탄소수준] ${body.carbonLevel} (전국 대비 ${body.nationalRatioPct >= 0 ? "+" : ""}${body.nationalRatioPct}% , 지역 1인당 ${body.regionPc.toFixed(2)} kgCO₂e)
[배출 비중 상위 카테고리] ${body.topCategory ?? "—"}

[추천 저탄소 코스]
${courseLines || "(없음)"}

[유사 저탄소 POI]
${similarLines || "(없음)"}

[규칙 기반 참고 주의사항]
${(body.ruleCautions ?? []).map((c) => `- ${c}`).join("\n") || "(없음)"}

[규칙 기반 참고 동선]
${(body.ruleSuggestions ?? []).map((c) => `- ${c}`).join("\n") || "(없음)"}

[웹 검색 참고]
${webContext}

반드시 아래 키만 포함한 유효한 JSON 하나만 출력:
{"regionSummary":"2~3문장","tips":[{"title":"제목","text":"한문장"},{"title":"제목","text":"한문장"},{"title":"제목","text":"한문장"}],"courseNote":"한 문단","cautions":["주의1","주의2"],"suggestions":["제안1","제안2"]}`;

  try {
    const { text, model, finishReason } = await hfChatCompletion({
      system,
      user,
      maxTokens: 4096,
    });
    const parsed = parseJsonBlock(text);
    if (!parsed) {
      return NextResponse.json({
        configured: true,
        source: "fallback",
        model,
        usedTavily,
        regionSummary: "",
        tips: [],
        courseNote: "",
        cautions: [],
        suggestions: [],
        error:
          finishReason === "length"
            ? "LLM 응답이 토큰 한도로 잘렸습니다 — 규칙 기반 가이드를 사용합니다."
            : "LLM JSON 파싱 실패 — 규칙 기반 가이드를 사용합니다.",
      } satisfies GuideAiResult);
    }

    const tips = Array.isArray(parsed.tips)
      ? parsed.tips
          .filter((t): t is { title: string; text: string } => Boolean(t?.title && t?.text))
          .slice(0, 5)
      : [];

    const result: GuideAiResult = {
      configured: true,
      source: "llm",
      model,
      usedTavily,
      regionSummary: String(parsed.regionSummary ?? "").trim(),
      tips,
      courseNote: String(parsed.courseNote ?? "").trim(),
      cautions: Array.isArray(parsed.cautions)
        ? parsed.cautions.map(String).filter(Boolean).slice(0, 5)
        : [],
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map(String).filter(Boolean).slice(0, 5)
        : [],
      sources: searchHits.map((h) => ({ title: h.title, url: h.url })),
    };
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "LLM 호출 실패";
    return NextResponse.json({
      configured: true,
      source: "fallback",
      usedTavily,
      regionSummary: "",
      tips: [],
      courseNote: "",
      cautions: [],
      suggestions: [],
      error: message,
    } satisfies GuideAiResult);
  }
}
