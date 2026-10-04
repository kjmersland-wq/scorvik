import type { SiteAnalysis, SourcedValue } from "@/types/project";

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"', nbsp: " ", copy: "©", reg: "®", trade: "™" };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);?/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const number = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attributes(tag: string): Record<string, string> {
  const output: Record<string, string> = {};
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) output[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  return output;
}

function getMeta(html: string, key: "name" | "property", value: string): string | undefined {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs[key]?.toLowerCase() === value.toLowerCase() && attrs.content) return attrs.content.trim();
  }
  return undefined;
}

function toSafeUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function extractTagText(html: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`, "gi");
  return [...html.matchAll(pattern)].map((match) => cleanText(match[1])).filter(Boolean).slice(0, 30);
}

export function parseWebsiteHtml(html: string, finalUrl: string): SiteAnalysis {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "").slice(0, 180);
  const description = getMeta(html, "name", "description") ?? getMeta(html, "property", "og:description") ?? "";
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0])).find((attrs) => attrs.rel?.toLowerCase().split(/\s+/).includes("canonical"))?.href;
  const icon = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0])).find((attrs) => /icon/i.test(attrs.rel ?? ""))?.href;
  const ogImage = getMeta(html, "property", "og:image") ?? getMeta(html, "name", "twitter:image");
  const headings = [...extractTagText(html, "h1"), ...extractTagText(html, "h2")].filter((text, index, all) => all.indexOf(text) === index).slice(0, 18);
  const subheadings = [...extractTagText(html, "h3"), ...extractTagText(html, "h4")].filter((text, index, all) => all.indexOf(text) === index).slice(0, 18);
  const visibleText = cleanText(html.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ").replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, " ")).slice(0, 16_000);
  const imageUrls = new Set<string>();
  const logoUrls = new Set<string>();
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const imageUrl = toSafeUrl(attrs.src ?? attrs["data-src"] ?? attrs["data-lazy-src"], finalUrl);
    if (!imageUrl || imageUrls.size >= 30) continue;
    imageUrls.add(imageUrl);
    if (/logo|brand|wordmark/i.test(`${attrs.alt ?? ""} ${attrs.class ?? ""} ${attrs.id ?? ""}`)) logoUrls.add(imageUrl);
  }
  const links: Array<{ label: string; url: string }> = [];
  const callsToAction: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)) {
    const attrs = attributes(match[0].slice(0, match[0].indexOf(">") + 1));
    const label = cleanText(match[0]).slice(0, 100);
    const href = toSafeUrl(attrs.href, finalUrl);
    if (!label || !href) continue;
    if (links.length < 25) links.push({ label, url: href });
    if (/shop|buy|book|start|try|contact|learn|discover|order|sign up|get started|menu/i.test(label) && callsToAction.length < 10) callsToAction.push(label);
  }
  const buttons = extractTagText(html, "button").slice(0, 20);
  for (const label of buttons) {
    if (/shop|buy|book|start|try|contact|learn|discover|order|sign up|get started|menu|continue|next/i.test(label) && callsToAction.length < 10 && !callsToAction.includes(label)) callsToAction.push(label);
  }
  const steps = extractTagText(html, "li").slice(0, 10).map((text) => {
    const firstSentenceEnd = text.search(/[.!?](?:\s|$)/);
    const title = firstSentenceEnd > 8 ? text.slice(0, firstSentenceEnd + 1) : text.slice(0, 84);
    return { title: title.trim(), description: text };
  });
  const colors = new Set<string>();
  for (const match of html.matchAll(/(?:color|background-color)\s*:\s*(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))/gi)) {
    if (colors.size >= 8) break;
    colors.add(match[1].replace(/\s+/g, ""));
  }
  const lang = html.match(/<html\b[^>]*\blang\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  const hostLabel = new URL(finalUrl).hostname.replace(/^www\./, "").split(".")[0];
  const brand = getMeta(html, "property", "og:site_name") ?? title.split(/[|–—-]/)[0]?.trim() ?? hostLabel;
  const ctaMatches = callsToAction;
  const benefits = [...headings, ...subheadings].filter((text) => /fast|simple|easy|secure|free|save|quality|sustainable|personal|built|made|support|delivery|results|manage|grow/i.test(text)).slice(0, 6);
  const proofPoints = [...visibleText.matchAll(/(?:\d[\d,.]*\+?\s*(?:customers|clients|reviews|years|orders|teams|countries|users)|trusted by|rated\s+[\d.]+\s*\/\s*5|award[- ]winning)/gi)].map((match) => match[0]).slice(0, 8);
  const fieldSources: Record<string, SourcedValue<unknown>> = {
    title: { value: title || brand, source: title ? "html:title" : "url:hostname", confidence: title ? "high" : "low" },
    description: { value: description, source: description ? "meta:description" : "none", confidence: description ? "high" : "low" },
    brand: { value: brand, source: getMeta(html, "property", "og:site_name") ? "meta:og:site_name" : "html:title/url", confidence: title ? "medium" : "low" },
    sellingPoints: { value: benefits, source: "html:headings", confidence: benefits.length ? "medium" : "low" },
  };
  return {
    url: finalUrl,
    title: title || `${brand} website`,
    description: description.slice(0, 500),
    brand: brand.slice(0, 100),
    colors: [...colors],
    sellingPoints: benefits,
    image: toSafeUrl(ogImage, finalUrl) ?? [...imageUrls][0] ?? "",
    canonicalUrl: toSafeUrl(canonical, finalUrl),
    faviconUrl: toSafeUrl(icon, finalUrl),
    openGraphImage: toSafeUrl(ogImage, finalUrl),
    language: lang?.[1] ?? lang?.[2] ?? lang?.[3],
    headings,
    subheadings,
    visibleText,
    images: [...imageUrls],
    logoCandidates: [...logoUrls],
    relevantLinks: links,
    buttons,
    steps,
    callsToAction: ctaMatches,
    proofPoints,
    fieldSources,
  };
}
