export interface GuideAiResult {
  configured: boolean;
  source: "llm" | "fallback";
  model?: string;
  usedTavily: boolean;
  regionSummary: string;
  tips: Array<{ title: string; text: string }>;
  courseNote: string;
  cautions: string[];
  suggestions: string[];
  sources?: Array<{ title: string; url: string }>;
  error?: string;
}
