// Quality review of a generated picture: cheap deterministic checks first, then (only if they pass) an AI review.
// `passed` is always decided here from the numbers, never by the model's own verdict.
export const passScore = 4;
const minBytes = 1_000;
const aspectTolerance = 0.08;

export interface ShotReview { score: number; passed: boolean; productRecognizable: boolean | null; issues: string[]; advice: string; reviewedBy: string }

/** Width and height of a PNG or JPEG from its bytes. null for other formats. */
export function imageDimensions(bytes: Uint8Array): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return [view.getUint32(16), view.getUint32(20)];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [view.getUint16(i + 7), view.getUint16(i + 5)];
      i += 2 + length;
    }
  }
  return null;
}

/** Cheap failure checks. An empty list means the picture can go on to the AI review. */
export function precheck(bytes: Uint8Array, aspect: string): string[] {
  const issues: string[] = [];
  if (bytes.length < minBytes) issues.push("The picture file is empty or almost empty.");
  const dims = imageDimensions(bytes);
  const [aw, ah] = aspect.split(":").map(Number);
  if (dims && aw > 0 && ah > 0) {
    const want = aw / ah;
    const got = dims[0] / dims[1];
    if (Math.abs(got - want) / want > aspectTolerance) issues.push(`Wrong aspect ratio: ${dims[0]}x${dims[1]} does not fit ${aspect}.`);
  }
  return issues;
}

export function buildReview(raw: { score?: unknown; product_recognizable?: unknown; issues?: unknown; advice?: unknown }, reviewedBy: string, productExpected: boolean): ShotReview {
  const score = Math.max(1, Math.min(5, Math.round(Number(raw.score) || 1)));
  const recognizable = productExpected && typeof raw.product_recognizable === "boolean" ? raw.product_recognizable : null;
  return {
    score,
    passed: score >= passScore && recognizable !== false,
    productRecognizable: recognizable,
    issues: Array.isArray(raw.issues) ? raw.issues.map(String).slice(0, 6) : [],
    advice: String(raw.advice ?? "").slice(0, 400),
    reviewedBy,
  };
}

export function failedPrecheck(issues: string[]): ShotReview {
  return { score: 1, passed: false, productRecognizable: null, issues, advice: "Render the scene again.", reviewedBy: "deterministic" };
}
