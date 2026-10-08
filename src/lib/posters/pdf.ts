// Minimal single-page PDF that places one JPEG at its exact physical size. No dependencies.

/** Page size in PDF points (1/72 inch) for a pixel size at a given dpi, rounded to two decimals. */
export function pointsFor(pixels: number, dpi: number): number {
  return Math.round(((pixels * 72) / dpi) * 100) / 100;
}

export function buildJpegPdf(jpeg: Uint8Array, widthPx: number, heightPx: number, dpi: number): Uint8Array {
  const w = pointsFor(widthPx, dpi);
  const h = pointsFor(heightPx, dpi);
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body.forEach((chunk) => push(chunk));
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%âãÏÓ\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  object(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  object(5, [
    encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    encoder.encode("\nendstream"),
  ]);

  const xrefAt = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((id) => `${String(offsets[id]).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}
