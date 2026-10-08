"use client";

/* eslint-disable @next/next/no-img-element -- reference pictures are small local data URLs, not optimisable files */

import { useState } from "react";
import { newAssetId, sanitizeAsset, type AssetKind, type LibraryAsset } from "@/lib/director/library";
import { referenceFromFile, removeAsset, saveAsset } from "@/lib/director/library-store";
import type { Locale } from "@/lib/i18n/copy";

/** Products and characters that must look the same in every scene. Mention one as @Name in a scene's words, or pick it next to an AI picture. */
export function LibraryPanel({ locale, assets }: { locale: Locale; assets: LibraryAsset[] }) {
  const no = locale === "no";
  const [kind, setKind] = useState<AssetKind>("product");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [appearance, setAppearance] = useState("");
  const [colors, setColors] = useState("");
  const [never, setNever] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [note, setNote] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    try { setImage(await referenceFromFile(file)); setNote(""); } catch (error) { setNote(error instanceof Error ? error.message : no ? "Bildet kunne ikke brukes." : "That picture could not be used."); }
  }

  function add() {
    const asset = sanitizeAsset({ id: newAssetId(), kind, name, description, appearance, colors, prohibitedChanges: never, image, createdAt: new Date().toISOString() });
    if (!asset) { setNote(no ? "Gi den et navn." : "Give it a name."); return; }
    if (!saveAsset(asset)) { setNote(no ? "Nettleseren fikk ikke lagret den. Prøv et mindre bilde." : "The browser could not store it. Try a smaller picture."); return; }
    setName(""); setDescription(""); setAppearance(""); setColors(""); setNever(""); setImage(undefined); setNote(no ? "Lagt til." : "Added.");
  }

  return (
    <details className="director-library">
      <summary>{no ? "Produkter og karakterer" : "Products and characters"} ({assets.length})</summary>
      <p className="field-caption">{no ? "Legg inn et bilde og noen ord, så ser produktet eller personen likt ut i hver AI-scene. Skriv @Navn i sceneteksten for å bruke den." : "Add a picture and a few words so the product or person looks the same in every AI scene. Write @Name in a scene's words to use it."}</p>
      {assets.length > 0 && (
        <ul className="library-items">
          {assets.map((asset) => (
            <li key={asset.id}>
              {asset.image ? <img src={asset.image} alt="" width={44} height={44} /> : <span className="library-noimage" aria-hidden="true">{asset.kind === "product" ? "▣" : "☺"}</span>}
              <span><b>{asset.name}</b> <small>{asset.kind === "product" ? (no ? "produkt" : "product") : (no ? "karakter" : "character")}{asset.image ? "" : (no ? " · uten bilde" : " · no picture")}</small></span>
              <button type="button" className="button button-light button-small" onClick={() => removeAsset(asset.id)} aria-label={`${no ? "Fjern" : "Remove"} ${asset.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="library-form">
        <div className="choice-row">
          {(["product", "character"] as const).map((value) => <button key={value} type="button" className={`choice ${kind === value ? "selected" : ""}`} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "product" ? (no ? "Produkt" : "Product") : (no ? "Karakter" : "Character")}</button>)}
        </div>
        <input className="field-control" value={name} maxLength={60} placeholder={no ? "Navn, for eksempel Blå flaske" : "Name, for example Blue bottle"} onChange={(event) => setName(event.target.value)} />
        <input className="field-control" value={description} maxLength={300} placeholder={no ? "Hva er det?" : "What is it?"} onChange={(event) => setDescription(event.target.value)} />
        <input className="field-control" value={appearance} maxLength={300} placeholder={no ? "Utseende: form, farger, emballasje, klær" : "Appearance: shape, colours, packaging, clothes"} onChange={(event) => setAppearance(event.target.value)} />
        <input className="field-control" value={colors} placeholder={no ? "Farger, adskilt med komma" : "Colours, separated by commas"} onChange={(event) => setColors(event.target.value)} />
        <input className="field-control" value={never} placeholder={no ? "Må aldri endres, adskilt med semikolon" : "Must never change, separated by semicolons"} onChange={(event) => setNever(event.target.value)} />
        <label className="library-file"><span>{no ? "Referansebilde" : "Reference picture"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pick(event.target.files?.[0])} /></label>
        {image && <img className="library-preview-image" src={image} alt="" width={96} height={96} />}
        <button type="button" className="button button-light button-small" disabled={!name.trim()} onClick={add}>{no ? "Legg til" : "Add"}</button>
        {note && <p className="field-caption" role="status">{note}</p>}
      </div>
    </details>
  );
}
