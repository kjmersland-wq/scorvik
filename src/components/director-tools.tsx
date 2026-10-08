"use client";

import { useEffect, useState } from "react";
import { applyEdits, type EditPlan, type EditableScene } from "@/lib/director/edit-apply";
import { findMentioned, referencesFor, type LibraryAsset } from "@/lib/director/library";
import type { ShotReview } from "@/lib/director/review";
import type { Locale } from "@/lib/i18n/copy";

const dollars = (value: number | null) => value === null ? "?" : value < 0.01 ? `<$0.01` : `$${value.toFixed(2)}`;

/** "Make scene 2 shorter and calmer": asks Claude for edits, shows what changed, and can take it back. */
export function EditWithWords<T extends EditableScene>({ locale, scenes, focusSceneId, brand, language, onChange }: {
  locale: Locale; scenes: T[]; focusSceneId?: string | null; brand?: string; language?: string; onChange: (next: T[]) => void;
}) {
  const no = locale === "no";
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [before, setBefore] = useState<T[] | null>(null);

  async function run() {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/director/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: text, scenes: scenes.map(({ id, headline, supportingText, voiceover, duration, visualQuery }) => ({ id, headline, supportingText, voiceover, duration, visualQuery })), focusSceneId, brand, language }),
      });
      const data = await response.json() as { plan?: EditPlan; error?: string; message?: string };
      if (response.status === 503) { setNote(no ? "Redigering med ord krever ANTHROPIC_API_KEY i .env.local." : "Editing with words needs ANTHROPIC_API_KEY in .env.local."); return; }
      if (!response.ok || !data.plan) { setNote(no ? "Det gikk ikke å endre. Prøv igjen." : "That edit did not work. Try again."); return; }
      if (!data.plan.edits.length) { setNote(data.plan.summary || (no ? "Ingen endringer ble foreslått." : "No changes were proposed.")); return; }
      setBefore(scenes);
      onChange(applyEdits(scenes, data.plan));
      setNote(`${data.plan.summary || (no ? "Endret." : "Changed.")} (${data.plan.edits.length} ${no ? (data.plan.edits.length === 1 ? "scene" : "scener") : (data.plan.edits.length === 1 ? "scene" : "scenes")})`);
      setInstruction("");
    } catch {
      setNote(no ? "Det gikk ikke å nå tjenesten." : "Could not reach the service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="director-edit" role="group" aria-label={no ? "Endre med ord" : "Edit with words"}>
      <label className="field-caption" htmlFor="director-edit-input">{no ? "Endre med ord" : "Edit with words"}{focusSceneId ? (no ? " (gjelder scenen du redigerer)" : " (about the scene you are editing)") : ""}</label>
      <div className="url-form">
        <input id="director-edit-input" className="field-control" value={instruction} maxLength={600} disabled={busy} placeholder={no ? "For eksempel: gjør scene 2 kortere og roligere" : "For example: make scene 2 shorter and calmer"} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void run(); } }} />
        <button type="button" className="button button-light button-small" disabled={busy || !instruction.trim()} onClick={() => void run()}>{busy ? (no ? "Tenker…" : "Thinking…") : (no ? "Endre" : "Change")}</button>
        {before && <button type="button" className="button button-light button-small" onClick={() => { onChange(before); setBefore(null); setNote(no ? "Endringen er angret." : "Change undone."); }}>{no ? "Angre" : "Undo"}</button>}
      </div>
      {note && <p className="field-caption" role="status">{note}</p>}
    </div>
  );
}

interface Estimates { configured: boolean; draft: { model: string; note: string; costUsd: number | null }; final: { model: string; note: string; costUsd: number | null } }

/** One AI picture for a scene, with the cost shown before it is spent, and an automatic quality review afterwards. */
export function AiPicture({ locale, prompt, description, sceneText, aspect, assets, onPicture }: {
  locale: Locale; prompt: string; description: string; sceneText: string; aspect: string; assets: LibraryAsset[]; onPicture: (url: string) => void;
}) {
  const no = locale === "no";
  const [estimates, setEstimates] = useState<Estimates | null>(null);
  const [busy, setBusy] = useState<"draft" | "final" | null>(null);
  const [note, setNote] = useState("");
  const [review, setReview] = useState<ShotReview | null>(null);
  const [variation, setVariation] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  // assets written as @Name in the scene's words are used automatically; the rest can be switched on here
  const mentioned = findMentioned(sceneText, assets).map((asset) => asset.id);
  const used = assets.filter((asset) => mentioned.includes(asset.id) || picked.includes(asset.id));
  const references = referencesFor(used);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/director/image?aspect=${encodeURIComponent(aspect)}`).then((response) => response.ok ? response.json() : null).then((data: Estimates | null) => { if (!cancelled && data) setEstimates(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [aspect]);

  async function generate(tier: "draft" | "final") {
    if (busy) return;
    setBusy(tier);
    setNote("");
    setReview(null);
    try {
      const response = await fetch("/api/director/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: references.words ? `${prompt}. ${references.words}` : prompt, aspect, tier, variation, referenceImageUrl: references.referenceImageUrl, productImageUrl: references.productImageUrl }) });
      const data = await response.json() as { url?: string; model?: string; degraded?: boolean; costUsd?: number | null; message?: string };
      if (response.status === 503) { setNote(no ? "AI-bilder krever FAL_KEY i .env.local." : "AI pictures need FAL_KEY in .env.local."); return; }
      if (!response.ok || !data.url) { setNote(no ? "Bildet kunne ikke lages. Prøv igjen." : "The picture could not be made. Try again."); return; }
      onPicture(data.url);
      setVariation((current) => current + 1);
      setNote(`${data.model}${data.degraded ? (no ? " (reservemodell)" : " (fallback model)") : ""} · ≈ ${dollars(data.costUsd ?? null)}`);
      const checked = await fetch("/api/director/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageUrl: data.url, description, aspect, productImageUrl: references.productImageUrl }) });
      if (checked.ok) setReview((await checked.json() as { review: ShotReview }).review);
    } catch {
      setNote(no ? "Det gikk ikke å nå tjenesten." : "Could not reach the service.");
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null || !prompt.trim();
  return (
    <div className="director-picture">
      <div className="choice-row">
        <button type="button" className="button button-light button-small" disabled={disabled} title={estimates?.draft.note} onClick={() => void generate("draft")}>{busy === "draft" ? (no ? "Lager…" : "Making…") : `${no ? "AI-bilde, utkast" : "AI picture, draft"}${estimates ? ` (≈ ${dollars(estimates.draft.costUsd)})` : ""}`}</button>
        <button type="button" className="button button-light button-small" disabled={disabled} title={estimates?.final.note} onClick={() => void generate("final")}>{busy === "final" ? (no ? "Lager…" : "Making…") : `${no ? "AI-bilde, endelig" : "AI picture, final"}${estimates ? ` (≈ ${dollars(estimates.final.costUsd)})` : ""}`}</button>
      </div>
      {assets.length > 0 && (
        <div className="choice-row" role="group" aria-label={no ? "Bruk fra biblioteket" : "Use from the library"}>
          {assets.map((asset) => {
            const on = used.some((item) => item.id === asset.id);
            const auto = mentioned.includes(asset.id);
            return <button key={asset.id} type="button" className={`choice ${on ? "selected" : ""}`} aria-pressed={on} disabled={auto} title={auto ? (no ? "Nevnt med @ i teksten" : "Mentioned with @ in the text") : undefined} onClick={() => setPicked((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])}>{asset.kind === "product" ? "▣" : "☺"} {asset.name}{asset.image ? "" : "*"}</button>;
          })}
        </div>
      )}
      {used.some((asset) => !asset.image) && <p className="field-caption">{no ? "* Uten referansebilde beskrives den bare med ord, så den kan bli litt ulik fra scene til scene." : "* Without a reference picture it is described in words only, so it may vary a little between scenes."}</p>}
      {references.referenceImageUrl && used.some((asset) => asset.kind === "product") && <p className="field-caption">{no ? "Ansiktsreferansen brukes. Produktet beskrives i tekst." : "The face reference is used. The product is described in words."}</p>}
      {estimates && !estimates.configured && <p className="field-caption">{no ? "Legg FAL_KEY i .env.local for å bruke AI-bilder." : "Add FAL_KEY to .env.local to use AI pictures."}</p>}
      {note && <p className="field-caption" role="status">{note}</p>}
      {review && <p className="field-caption" role="status">{review.passed ? "✓" : "✕"} {no ? "Kvalitet" : "Quality"} {review.score}/5{review.issues.length ? ` · ${review.issues.join("; ")}` : ""}{review.advice && !review.passed ? ` · ${review.advice}` : ""}</p>}
    </div>
  );
}
