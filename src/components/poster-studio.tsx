"use client";

/* Poster previews are blob: URLs and proxied site pictures. next/image cannot optimise either, so plain <img> is correct here. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { posterPlacements } from "@/lib/platforms/presets";
import { saveProject } from "@/lib/projects";
import { proxiedImageUrl, loadPosterBitmap, type PosterImages } from "@/lib/posters/assets";
import { buildPosterBrief, CLAIM_MAX, claimCandidates, extractPrice, heroCandidates } from "@/lib/posters/brief";
import { chooseLayout } from "@/lib/posters/layout";
import { renderPosterPack } from "@/lib/posters/pack";
import { renderPosterBlob } from "@/lib/posters/render-poster";
import type { Locale } from "@/lib/i18n/copy";
import type { PosterLayoutKind, SiteAnalysis, VideoProject } from "@/types/project";
import styles from "./poster-studio.module.css";

const copy = {
  en: {
    film: "Film",
    posters: "Posters",
    eyebrow: "Posters",
    title: "One poster for every placement",
    intro: "Made from your site's own picture, logo, name and a line already on the page. Edit the words, then export the whole pack.",
    claim: "Claim",
    claimHint: `The line the poster is built around (${CLAIM_MAX} characters at most).`,
    price: "Price",
    priceHint: "Leave empty for no price. Found on the page when there is one.",
    location: "Location",
    locationHint: "Optional. Only shown if you add it.",
    picture: "Picture",
    noPicture: "No picture",
    another: "Other lines from the page",
    layout: "Layout",
    layouts: { claim: "Claim", price: "Price", steps: "Steps" } as Record<PosterLayoutKind, string>,
    why: {
      claim: "No price found. The claim is the poster and the picture is proof.",
      price: "The page shows a price, so the price comes second after the claim.",
      steps: "A docs or how-to page: three numbered steps from its headings.",
    } as Record<PosterLayoutKind, string>,
    exportAll: "Export all posters (.zip)",
    exporting: "Exporting",
    rendering: "Drawing the posters…",
    mock: "Mock",
    mockNote: "This project comes from a mock analysis, so every poster is labelled Mock.",
    pictureFailed: "The site's picture could not be loaded, so the posters use type only.",
    exportFailed: "The pack could not be created. Try again.",
    pack: "The pack holds every size below, the A3 as a PDF too, and a contact sheet.",
  },
  no: {
    film: "Film",
    posters: "Plakater",
    eyebrow: "Plakater",
    title: "Én plakat for hver plassering",
    intro: "Laget av nettsidens eget bilde, logo, navn og en linje som allerede står på siden. Rediger ordene og eksporter hele pakken.",
    claim: "Påstand",
    claimHint: `Linjen plakaten bygges rundt (maks ${CLAIM_MAX} tegn).`,
    price: "Pris",
    priceHint: "La stå tomt for ingen pris. Hentes fra siden når den har en.",
    location: "Sted",
    locationHint: "Valgfritt. Vises bare hvis du legger det til.",
    picture: "Bilde",
    noPicture: "Uten bilde",
    another: "Andre linjer fra siden",
    layout: "Oppsett",
    layouts: { claim: "Påstand", price: "Pris", steps: "Steg" } as Record<PosterLayoutKind, string>,
    why: {
      claim: "Ingen pris funnet. Påstanden er plakaten, og bildet er beviset.",
      price: "Siden viser en pris, så prisen kommer som nummer to etter påstanden.",
      steps: "En dokumentasjons- eller veiledningsside: tre nummererte steg fra overskriftene.",
    } as Record<PosterLayoutKind, string>,
    exportAll: "Eksporter alle plakater (.zip)",
    exporting: "Eksporterer",
    rendering: "Tegner plakatene…",
    mock: "Mock",
    mockNote: "Dette prosjektet kommer fra en mock-analyse, så alle plakater er merket Mock.",
    pictureFailed: "Nettsidens bilde kunne ikke lastes, så plakatene bruker bare tekst.",
    exportFailed: "Pakken kunne ikke lages. Prøv igjen.",
    pack: "Pakken har alle størrelsene under, A3 også som PDF, og et kontaktark.",
  },
};

export type StudioTab = "film" | "posters";

/** Film stays the default. The Posters tab sits next to it wherever a site analysis exists. */
export function StudioTabs({ tab, onChange, locale = "en" }: { tab: StudioTab; onChange: (tab: StudioTab) => void; locale?: Locale }) {
  const text = copy[locale];
  return (
    <div className={styles.tabs} role="tablist" aria-label={locale === "no" ? "Velg film eller plakater" : "Choose film or posters"}>
      {(["film", "posters"] as const).map((id) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`} onClick={() => onChange(id)}>
          {text[id]}
        </button>
      ))}
    </div>
  );
}

interface PosterStudioProps {
  analysis: SiteAnalysis;
  project?: VideoProject | null;
  locale?: Locale;
  mode?: "advert" | "instruction";
}

export function PosterStudio({ analysis, project, locale = "en", mode }: PosterStudioProps) {
  const text = copy[locale];
  const saved = project?.posters;
  const lines = useMemo(() => claimCandidates(analysis), [analysis]);
  const heroes = useMemo(() => heroCandidates(analysis).slice(0, 8), [analysis]);
  const [claim, setClaim] = useState(saved?.claim ?? lines[0] ?? analysis.brand);
  const [price, setPrice] = useState(saved?.price ?? extractPrice(analysis.visibleText) ?? "");
  const [location, setLocation] = useState(saved?.location ?? "");
  const [hero, setHero] = useState<string | undefined>(saved?.heroUrl);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<{ key: string; images: PosterImages } | null>(null);
  const [renderedKey, setRenderedKey] = useState("");
  const [exportState, setExportState] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const bitmapCache = useRef(new Map<string, ImageBitmap | null>());
  const generation = useRef(0);
  const shownUrls = useRef<string[]>([]);
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; });

  const brief = useMemo(
    () => buildPosterBrief(analysis, { claim, price, location, heroUrl: hero, mode }),
    [analysis, claim, price, location, hero, mode],
  );
  const layoutKind = chooseLayout(brief);
  const imagesKey = `|`;
  const imagesReady = loaded?.key === imagesKey;
  const images = useMemo<PosterImages>(() => loaded?.images ?? {}, [loaded]);
  const renderKey = useMemo(() => JSON.stringify(brief) + imagesKey, [brief, imagesKey]);
  const drawing = !imagesReady || renderedKey !== renderKey;

  // Load the logo and the chosen picture once each (through the SSRF-checked image proxy).
  useEffect(() => {
    let cancelled = false;
    const pick = async (url: string | undefined, minSide: number) => {
      if (!url) return undefined;
      if (!bitmapCache.current.has(url)) bitmapCache.current.set(url, (await loadPosterBitmap(url, analysis.url, minSide)) ?? null);
      return bitmapCache.current.get(url) ?? undefined;
    };
    void Promise.all([pick(brief.logoUrl, 24), pick(brief.heroUrl, 120)]).then(([logo, heroBitmap]) => {
      if (!cancelled) setLoaded({ key: imagesKey, images: { logo, hero: heroBitmap } });
    });
    return () => { cancelled = true; };
  }, [analysis.url, brief.logoUrl, brief.heroUrl, imagesKey]);

  // Edits re-render locally. The site is never analysed again.
  useEffect(() => {
    if (!imagesReady) return;
    const mine = ++generation.current;
    const timer = window.setTimeout(async () => {
      const next: Record<string, string> = {};
      const masters = new Map<string, string>();
      try {
        for (const placement of posterPlacements) {
          if (generation.current !== mine) return;
          const reuse = placement.sameMasterAs ? masters.get(placement.sameMasterAs) : undefined;
          if (reuse) { next[placement.id] = reuse; continue; }
          const { blob } = await renderPosterBlob(brief, placement, images);
          const url = URL.createObjectURL(blob);
          masters.set(placement.id, url);
          next[placement.id] = url;
          if (generation.current === mine) setPreviews((current) => ({ ...current, [placement.id]: url }));
        }
      } catch {
        if (generation.current === mine) setError(text.exportFailed);
        return;
      }
      if (generation.current !== mine) { masters.forEach((url) => URL.revokeObjectURL(url)); return; }
      shownUrls.current.forEach((url) => URL.revokeObjectURL(url));
      shownUrls.current = [...masters.values()];
      setPreviews(next);
      setRenderedKey(renderKey);
      const current = projectRef.current;
      if (current && (current.posters?.claim !== brief.claim || current.posters?.price !== brief.price || current.posters?.layout !== layoutKind || current.posters?.location !== brief.location || current.posters?.heroUrl !== brief.heroUrl)) {
        saveProject({ ...current, posters: { claim: brief.claim, price: brief.price, layout: layoutKind, location: brief.location, heroUrl: brief.heroUrl, updatedAt: new Date().toISOString() } });
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief, images, imagesReady, renderKey]);

  useEffect(() => () => { shownUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  async function exportPack() {
    setError("");
    setExportState({ done: 0, total: posterPlacements.length + 2 });
    try {
      const pack = await renderPosterPack(brief, images, { onProgress: (progress) => setExportState({ done: progress.done, total: progress.total }) });
      const url = URL.createObjectURL(pack.zip);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pack.zipName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(text.exportFailed);
    } finally {
      setExportState(null);
    }
  }

  const pictureMissing = imagesReady && Boolean(brief.heroUrl) && !images.hero;

  return (
    <section className={`panel panel-pad ${styles.studio}`} aria-label={text.title}>
      <div className="panel-head">
        <div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><small>{text.intro}</small></div>
        {brief.mock && <span className="tag">{text.mock}</span>}
      </div>

      <div className={styles.controls}>
        <label className={styles.field}>
          <span>{text.claim}</span>
          <textarea value={claim} maxLength={CLAIM_MAX} rows={2} onChange={(event) => setClaim(event.target.value)} />
          <small>{text.claimHint} {claim.length}/{CLAIM_MAX}</small>
        </label>
        <label className={styles.field}>
          <span>{text.price}</span>
          <input value={price} maxLength={24} onChange={(event) => setPrice(event.target.value)} />
          <small>{text.priceHint}</small>
        </label>
        <label className={styles.field}>
          <span>{text.location}</span>
          <input value={location} maxLength={40} onChange={(event) => setLocation(event.target.value)} />
          <small>{text.locationHint}</small>
        </label>
      </div>

      {lines.length > 1 && (
        <div className={styles.lines}>
          <small>{text.another}</small>
          <div className="tag-list">
            {lines.slice(0, 5).map((line) => <button key={line} type="button" className={`tag ${styles.lineChoice}`} onClick={() => setClaim(line)}>{line}</button>)}
          </div>
        </div>
      )}

      {heroes.length > 0 && (
        <div className={styles.pictures}>
          <small>{text.picture}</small>
          <div className={styles.strip} role="radiogroup" aria-label={text.picture}>
            {heroes.map((url) => (
              <button key={url} type="button" role="radio" aria-checked={brief.heroUrl === url} className={`${styles.thumb} ${brief.heroUrl === url ? styles.thumbActive : ""}`} onClick={() => setHero(url)}>
                <img src={proxiedImageUrl(url, analysis.url)} alt="" loading="lazy" />
              </button>
            ))}
            <button type="button" role="radio" aria-checked={brief.heroUrl === undefined} className={`${styles.thumb} ${styles.thumbNone} ${brief.heroUrl === undefined ? styles.thumbActive : ""}`} onClick={() => setHero("")}>{text.noPicture}</button>
          </div>
        </div>
      )}

      <p className="field-caption">
        <b>{text.layout}: {text.layouts[layoutKind]}.</b> {text.why[layoutKind]} {text.pack}
      </p>
      {brief.mock && <p className="field-caption">{text.mockNote}</p>}
      {pictureMissing && <p className="field-caption" role="status">{text.pictureFailed}</p>}
      {error && <p className="field-caption" role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className="button" onClick={() => void exportPack()} disabled={!imagesReady || drawing || exportState !== null || !brief.claim.trim()}>
          {exportState ? `${text.exporting} ${exportState.done}/${exportState.total}` : text.exportAll}
        </button>
        {(drawing || !imagesReady) && <small role="status">{text.rendering}</small>}
      </div>

      <ul className={styles.grid}>
        {posterPlacements.map((placement) => (
          <li key={placement.id} className={styles.card}>
            <div className={styles.frame} style={{ aspectRatio: `${placement.width} / ${placement.height}` }}>
              {previews[placement.id] && (
                  <img src={previews[placement.id]} alt={`${placement.label}, ${placement.width} by ${placement.height}`} width={placement.width} height={placement.height} />
              )}
            </div>
            <div className={styles.caption}><b>{placement.label}</b><span>{placement.width}×{placement.height}</span></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
