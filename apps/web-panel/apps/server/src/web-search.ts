import OpenAI from "openai";

export interface WebSearchResult {
  answer: string;
  sources: { title: string; url: string }[];
  images: { url: string; sourceUrl?: string; alt: string }[];
}

function uniqueByUrl<T extends { url: string }>(items: T[]) {
  const unique = new Map<string, T>();
  for (const item of items) if (!unique.has(item.url)) unique.set(item.url, item);
  return [...unique.values()];
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

export function extractWebSearchImages(output: unknown[], query: string): WebSearchResult["images"] {
  const images: WebSearchResult["images"] = [];
  for (const item of output as any[]) {
    const results = [
      ...(Array.isArray(item?.results) ? item.results : []),
      ...(Array.isArray(item?.action?.results) ? item.action.results : []),
    ];
    for (const result of results) {
      const imageUrl = result?.image_url ?? result?.thumbnail_url;
      if (!isHttpUrl(imageUrl)) continue;
      const sourceUrl = result?.source_website_url ?? result?.url;
      images.push({
        url: imageUrl,
        ...(isHttpUrl(sourceUrl) ? { sourceUrl } : {}),
        alt: String(result?.caption ?? result?.title ?? query),
      });
    }
  }
  return uniqueByUrl(images).slice(0, 6);
}

export async function searchWeb(apiKey: string, model: string, query: string, includeImages = false, options: { imagesOnly?: boolean; signal?: AbortSignal } = {}): Promise<WebSearchResult> {
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 45_000 });
  const webSearchTool = includeImages
    ? {
        type: "web_search",
        search_context_size: "low",
        search_content_types: options.imagesOnly ? ["image"] : ["image", "text"],
        image_settings: { max_results: options.imagesOnly ? 3 : 6, caption: true },
      }
    : { type: "web_search", search_context_size: "medium" };
  const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      max_output_tokens: options.imagesOnly ? 600 : 2000,
      tools: [webSearchTool],
      tool_choice: "required",
      input: options.imagesOnly ? `Znajdź do 3 prawdziwych zdjęć ilustrujących temat: ${query}. Nie opracowuj odpowiedzi ani artykułu, tylko wyszukaj obrazy.` : `Wyszukaj aktualne informacje dla użytkownika WallDeck. Odpowiedz po polsku, zwięźle i rzeczowo.${includeImages ? " Znajdź także prawdziwe, trafne zdjęcia do pokazania na ekranie." : ""} Zapytanie: ${query}`,
      include: ["web_search_call.action.sources", "web_search_call.results"],
      store: false,
  } as any, { signal: options.signal });
  const sources: { title: string; url: string }[] = [];
  const output = (response as any).output ?? [];
  for (const item of output) {
      for (const content of item.content ?? []) {
        for (const annotation of content.annotations ?? []) {
          const citation = annotation.url_citation ?? annotation;
          if (typeof citation.url === "string") sources.push({ title: String(citation.title ?? citation.url), url: citation.url });
        }
      }
      for (const source of item.action?.sources ?? []) {
        if (typeof source.url === "string") sources.push({ title: String(source.title ?? source.url), url: source.url });
      }
  }
  return { answer: response.output_text.trim(), sources: uniqueByUrl(sources).slice(0, 10), images: extractWebSearchImages(output, query) };
}
