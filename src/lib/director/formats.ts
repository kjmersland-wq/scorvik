// Format rules: each aspect ratio gets its own composition instead of a crop. Deterministic, free of AI.
export const supportedAspects = ["16:9", "9:16", "4:5", "1:1", "4:3", "3:4"] as const;
export type Aspect = (typeof supportedAspects)[number];
const portrait = new Set<string>(["9:16", "4:5", "3:4"]);

const composition: Record<Aspect, string> = {
  "16:9": "wide landscape composition, subject on a third, room to breathe on both sides",
  "4:3": "classic balanced composition, subject slightly off center",
  "9:16": "vertical composition, subject centered in the upper two thirds with generous headroom, lower third kept clear for captions",
  "3:4": "vertical portrait composition, subject centered with headroom",
  "4:5": "social feed composition, subject slightly above center, balanced framing",
  "1:1": "centered square composition, subject filling the frame",
};

export function compositionHint(aspect: string): string {
  return composition[aspect as Aspect] ?? "";
}

/** The fields to change when a scene moves to another format (empty = nothing). Tall and square frames handle extreme wides badly. */
export function adaptForAspect(shotType: string, lens: string, aspect: string): { shotType?: string; lens?: string } {
  const changes: { shotType?: string; lens?: string } = {};
  if (portrait.has(aspect) || aspect === "1:1") {
    if (shotType === "Extreme Wide Shot") changes.shotType = "Wide Shot";
    if (lens === "18mm Ultra-Wide") changes.lens = "24mm Wide";
  }
  return changes;
}

const falSizes: Record<string, string> = { "16:9": "landscape_16_9", "4:3": "landscape_4_3", "1:1": "square_hd", "3:4": "portrait_4_3", "9:16": "portrait_16_9", "4:5": "custom_4_5" };
export const imageSizeFor = (aspect: string) => falSizes[aspect] ?? "landscape_16_9";
