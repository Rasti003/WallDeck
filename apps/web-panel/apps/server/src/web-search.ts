import OpenAI from "openai";

export interface WebSearchResult {
  answer: string;
  sources: { title: string; url: string }[];
  images: { url: string; sourceUrl?: string; alt: string }[];
}

function uniqueByUrl<T extends { url: string }>(items: T[]) {
  return [...new Map(items.map(item => [item.url, item])).values()];
}

export async function searchWeb(apiKey: string, model: string, query: string): Promise<WebSearchResult> {
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
      model,
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      input: `Wyszukaj aktualne informacje dla użytkownika WallDeck. Odpowiedz po polsku, zwięźle i rzeczowo. Zapytanie: ${query}`,
      include: ["web_search_call.action.sources", "web_search_call.results"],
      store: false,
  } as any);
  const sources: { title: string; url: string }[] = [];
  const images: { url: string; sourceUrl?: string; alt: string }[] = [];
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
      for (const result of item.results ?? []) {
        const imageUrl = result.image_url ?? result.thumbnail_url;
        if (typeof imageUrl === "string") images.push({ url: imageUrl, sourceUrl: typeof result.url === "string" ? result.url : undefined, alt: String(result.title ?? query) });
      }
  }
  return { answer: response.output_text.trim(), sources: uniqueByUrl(sources).slice(0, 10), images: uniqueByUrl(images).slice(0, 6) };
}
