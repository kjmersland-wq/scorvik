"use client";

// The product and character library lives in this browser (localStorage), like the projects do.
import { useSyncExternalStore } from "react";
import { sanitizeAsset, type LibraryAsset } from "./library.ts";

const key = "scorvik.library.v1";
const changed = "scorvik-library-changed";
const empty: LibraryAsset[] = [];
let cachedRaw: string | null = null;
let cachedValue: LibraryAsset[] = empty;

function read(): LibraryAsset[] {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key); } catch { return empty; }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    cachedValue = Array.isArray(parsed) ? parsed.map(sanitizeAsset).filter((asset): asset is LibraryAsset => asset !== null) : empty;
  } catch { cachedValue = empty; }
  return cachedValue;
}

/** false when the browser refused to store it (private window, full storage) */
function write(assets: LibraryAsset[]): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(assets));
    window.dispatchEvent(new Event(changed));
    return true;
  } catch { return false; }
}

function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(changed, listener); window.removeEventListener("storage", listener); };
}

export function useLibrary(): LibraryAsset[] {
  return useSyncExternalStore(subscribe, read, () => empty);
}

export const saveAsset = (asset: LibraryAsset) => write([...read().filter((item) => item.id !== asset.id), asset]);
export const removeAsset = (id: string) => write(read().filter((item) => item.id !== id));

/** Shrinks a picked picture to a small JPEG (on white, so cut-out products keep a clean background). */
export async function referenceFromFile(file: File, longSide = 1024): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPEG or WebP picture.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the picture.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
