import type { SiteAnalysis, WebsiteSource } from "@/types/project";
import { fetchWebsiteHtml, type FetchHtmlOptions } from "./fetch-html.ts";
import { parseWebsiteHtml } from "./parse-html.ts";
import { WebsiteIngestionError } from "./security.ts";

export interface WebsiteIngestionResult {
  source: WebsiteSource;
  analysis: SiteAnalysis;
}

export class WebsiteIngestionService {
  constructor(private readonly fetchOptions: FetchHtmlOptions = {}) {}

  async analyze(input: string): Promise<WebsiteIngestionResult> {
    const fetched = await fetchWebsiteHtml(input, this.fetchOptions);
    const analysis = parseWebsiteHtml(fetched.body, fetched.url);
    if ((analysis.visibleText ?? "").trim().length < 30 && !analysis.headings?.length && !analysis.description) {
      throw new WebsiteIngestionError("EMPTY_PAGE", "This webpage doesn't contain enough readable content.");
    }
    const source: WebsiteSource = {
      submittedUrl: input,
      finalUrl: fetched.url,
      fetchedAt: new Date().toISOString(),
      mode: "real",
    };
    return { source, analysis: { ...analysis, source } };
  }
}
