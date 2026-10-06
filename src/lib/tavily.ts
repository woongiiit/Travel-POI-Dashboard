import { getSetting } from "./local-settings";

export function getTavilyConfigured(): boolean {
  return Boolean(getSetting("TAVILY_API_KEY"));
}

export interface TavilyHit {
  title: string;
  url: string;
  content: string;
}

export async function tavilySearch(
  query: string,
  options?: { maxResults?: number },
): Promise<TavilyHit[]> {
  const apiKey = getSetting("TAVILY_API_KEY");
  if (!apiKey) return [];

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: false,
      max_results: options?.maxResults ?? 4,
      topic: "general",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (json.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: (r.content ?? "").slice(0, 400),
  }));
}
