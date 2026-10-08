import type { PosterBrief, PosterLayoutKind, PosterPlacement } from "@/types/project";
import { posterPlacements } from "../platforms/presets.ts";
import type { PosterImages } from "./assets.ts";
import { chooseLayout } from "./layout.ts";
import { buildJpegPdf } from "./pdf.ts";
import { canvasBlob, renderContactSheet, renderPosterCanvas } from "./render-poster.ts";
import { buildZip } from "./zip.ts";

export interface PosterFile { name: string; blob: Blob; kind: "png" | "pdf" | "sheet"; placementId?: string }

export interface PosterPackResult { zip: Blob; zipName: string; files: PosterFile[]; layout: PosterLayoutKind }

export interface PackProgress { done: number; total: number; label: string }

export function posterFileName(host: string, placement: PosterPlacement, extension: "png" | "pdf"): string {
  return `${host || "poster"}-${placement.fileStem}-${placement.width}x${placement.height}.${extension}`;
}

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Poster export was cancelled.", "AbortError");
}

/**
 * Renders every placement one after another and packs them with the A3 PDF and the contact sheet into {host}-posters.zip.
 * Works from the brief and pictures that are already loaded: it never analyses the site again.
 */
export async function renderPosterPack(
  brief: PosterBrief,
  images: PosterImages,
  options: { kind?: PosterLayoutKind; onProgress?: (progress: PackProgress) => void; signal?: AbortSignal } = {},
): Promise<PosterPackResult> {
  const kind = options.kind ?? chooseLayout(brief);
  const files: PosterFile[] = [];
  const masters = new Map<string, Blob>();
  const sheetItems: Array<{ cell: { id: string; label: string; width: number; height: number }; blob: Blob }> = [];
  const total = posterPlacements.length + 2;
  let done = 0;
  const report = (label: string) => options.onProgress?.({ done, total, label });

  for (const placement of posterPlacements) {
    checkAborted(options.signal);
    report(placement.label);
    let blob = placement.sameMasterAs ? masters.get(placement.sameMasterAs) : undefined; // same master, separate file
    if (!blob) {
      const { canvas } = await renderPosterCanvas(brief, placement, images, { kind });
      blob = await canvasBlob(canvas, "image/png");
      masters.set(placement.id, blob);
      if (placement.pdf) {
        const jpeg = await canvasBlob(canvas, "image/jpeg", 0.95);
        files.push({ name: posterFileName(brief.host, placement, "pdf"), kind: "pdf", placementId: placement.id, blob: new Blob([buildJpegPdf(await bytes(jpeg), placement.width, placement.height, placement.dpi ?? 150) as BlobPart], { type: "application/pdf" }) });
      }
    }
    files.push({ name: posterFileName(brief.host, placement, "png"), kind: "png", placementId: placement.id, blob });
    sheetItems.push({ cell: { id: placement.id, label: placement.label, width: placement.width, height: placement.height }, blob });
    done += 1;
  }

  checkAborted(options.signal);
  report("Contact sheet");
  files.push({ name: `${brief.host || "poster"}-contact-sheet.png`, kind: "sheet", blob: await renderContactSheet(sheetItems, brief.name) });
  done += 1;

  report("Packing");
  const zipBytes = buildZip(await Promise.all(files.map(async (file) => ({ name: file.name, data: await bytes(file.blob) }))));
  done += 1;
  report("Done");
  return { zip: new Blob([zipBytes as BlobPart], { type: "application/zip" }), zipName: `${brief.host || "poster"}-posters.zip`, files, layout: kind };
}
