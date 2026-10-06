/** HuggingFace Inference (OpenAI-compatible chat) helpers — server only. */

import { getSetting } from "./local-settings";

export function getHfConfig(): {
  apiKey: string;
  model: string;
  temperature: number;
  configured: boolean;
} {
  const apiKey = getSetting("HUGGINGFACE_API_KEY");
  const model = getSetting("HUGGINGFACE_MODEL") || "Qwen/Qwen2.5-7B-Instruct";
  const raw = getSetting("HUGGINGFACE_TEMPERATURE");
  const temperature = raw ? Number(raw) : 0.4;
  return {
    apiKey,
    model,
    temperature: Number.isFinite(temperature) ? temperature : 0.4,
    configured: Boolean(apiKey),
  };
}

/** Qwen3 등 reasoning 모델의 think 블록·잡담 제거 */
export function stripReasoning(text: string): string {
  let t = text;
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/<think>[\s\S]*$/gi, "");
  // 잘린 마크다운 코드펜스만 남은 경우 대비
  t = t.replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes("{") ? m : ""));
  return t.trim();
}

export async function hfChatCompletion(input: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; model: string; finishReason?: string }> {
  const cfg = getHfConfig();
  if (!cfg.configured) {
    throw new Error("HUGGINGFACE_API_KEY 미설정");
  }

  const isQwen3 = /qwen3/i.test(cfg.model);
  const body: Record<string, unknown> = {
    model: cfg.model,
    temperature: input.temperature ?? cfg.temperature,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    max_tokens: input.maxTokens ?? 4096,
    response_format: { type: "json_object" },
  };

  // Qwen3 reasoning 모드 끄기 (지원 provider에만 전달)
  if (isQwen3) {
    body.chat_template_kwargs = { enable_thinking: false };
    body.enable_thinking = false;
  }

  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    // response_format 미지원 시 1회 재시도
    if (res.status === 400 && /response_format|json_object/i.test(errBody)) {
      delete body.response_format;
      const retry = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!retry.ok) {
        const b2 = await retry.text().catch(() => "");
        throw new Error(`HuggingFace API ${retry.status}: ${b2.slice(0, 240)}`);
      }
      return readCompletion(await retry.json(), cfg.model);
    }
    throw new Error(`HuggingFace API ${res.status}: ${errBody.slice(0, 240)}`);
  }

  return readCompletion(await res.json(), cfg.model);
}

function readCompletion(
  json: {
    choices?: Array<{
      message?: { content?: string; reasoning_content?: string };
      finish_reason?: string;
    }>;
    model?: string;
  },
  fallbackModel: string,
): { text: string; model: string; finishReason?: string } {
  const choice = json.choices?.[0];
  let text = choice?.message?.content?.trim() ?? "";
  // 일부 모델은 content가 비고 reasoning만 채움
  if (!text && choice?.message?.reasoning_content) {
    text = choice.message.reasoning_content.trim();
  }
  text = stripReasoning(text);
  if (!text) throw new Error("HuggingFace 응답이 비어 있습니다.");
  return {
    text,
    model: json.model ?? fallbackModel,
    finishReason: choice?.finish_reason,
  };
}
