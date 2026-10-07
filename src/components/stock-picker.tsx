"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/copy";
import type { StockItem } from "@/lib/stock/search";

interface Sources { pixabay: boolean; unsplash: boolean }

export function StockPicker({ initialQuery, locale = "en", onPick, onClose }: { initialQuery: string; locale?: Locale; onPick: (item: StockItem) => void; onClose: () => void }) {
  const nb = locale === "no";
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [items, setItems] = useState<StockItem[]>([]);
  const [sources, setSources] = useState<Sources | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");

  async function search(nextQuery = query, nextKind = kind) {
    if (!nextQuery.trim()) return;
    setState("loading");
    try {
      const response = await fetch(`/api/stock?q=${encodeURIComponent(nextQuery.trim())}&kind=${nextKind}&lang=${nb ? "no" : "en"}`);
      const data = await response.json() as { sources?: Sources; items?: StockItem[] };
      if (data.sources) setSources(data.sources);
      setItems(data.items ?? []);
      setState(response.ok ? (data.items?.length ? "idle" : "empty") : "error");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void fetch("/api/stock").then((response) => response.json()).then((data: { sources?: Sources }) => { if (data.sources) setSources(data.sources); }).catch(() => {});
  }, []);

  const noKeys = sources && !sources.pixabay && !sources.unsplash;

  return <div className="stock-picker" role="dialog" aria-label={nb ? "Bilder og video fra arkiv" : "Stock pictures and video"}>
    <div className="stock-bar">
      <input className="field-control" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder={nb ? "Søk, f.eks. restaurant kjøkken" : "Search, e.g. restaurant kitchen"} aria-label={nb ? "Søk i arkiv" : "Search stock"} />
      <button type="button" className="button button-small" onClick={() => void search()}>{nb ? "Søk" : "Search"}</button>
      <button type="button" className="button button-light button-small" onClick={onClose}>{nb ? "Lukk" : "Close"}</button>
    </div>
    <div className="choice-row">
      {(["image", "video"] as const).map((value) => <button key={value} type="button" className={`choice ${kind === value ? "selected" : ""}`} aria-pressed={kind === value} onClick={() => { setKind(value); void search(query, value); }}>{value === "image" ? (nb ? "Bilder" : "Pictures") : (nb ? "Videoklipp" : "Video clips")}</button>)}
    </div>
    {noKeys && <p className="field-caption">{nb ? "Legg inn PIXABAY_API_KEY (og gjerne UNSPLASH_ACCESS_KEY) i Vercel for å bruke arkivet." : "Add PIXABAY_API_KEY (and optionally UNSPLASH_ACCESS_KEY) in Vercel to use the library."}</p>}
    {state === "loading" && <p className="field-caption">{nb ? "Søker…" : "Searching…"}</p>}
    {state === "empty" && <p className="field-caption">{nb ? "Fant ingenting. Prøv et annet søkeord." : "Nothing found. Try another search."}</p>}
    {state === "error" && <p className="field-caption" role="alert">{nb ? "Søket feilet. Prøv igjen." : "The search failed. Try again."}</p>}
    <div className="stock-grid">{items.map((item) => <button type="button" key={`${item.source}-${item.id}`} className="stock-item" onClick={() => onPick(item)} title={`${item.credit} · ${item.source}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item.previewUrl ? <img src={item.previewUrl} alt={item.credit} loading="lazy" /> : <span className="stock-noprev">{nb ? "Video" : "Video"}</span>}
      <small>{item.kind === "video" ? "▶ " : ""}{item.source === "unsplash" ? "Unsplash" : "Pixabay"} · {item.credit}</small>
    </button>)}</div>
  </div>;
}
