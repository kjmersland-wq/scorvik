// Conversational editing: "make scene 2 shorter and calmer" becomes a small, validated set of changes to the storyboard.
// The model only proposes; this file decides what is allowed, and the studio applies it (with undo).
import { callTool, type ToolSpec } from "./claude.ts";

import type { EditPlan, EditableScene, SceneChanges, SceneEdit } from "./edit-apply.ts";
export { applyEdits } from "./edit-apply.ts";
export type { EditPlan, EditableScene, SceneChanges, SceneEdit } from "./edit-apply.ts";

const limits = { headline: 80, supportingText: 140, voiceover: 400 };

export const editSystem = `You are the director editing an existing short film at the client's request. Make the smallest set of changes that fulfils the instruction.
- Work out WHICH scene(s) the instruction concerns (use the scene ids given; a focus scene id from the user has priority), WHAT fields change and the new value. Leave every other scene out of the edits list.
- Include only the fields you actually change.
- Keep headline, supportingText and voiceover in the same language as the existing text. visualQuery is 2-4 English words describing matching stock footage.
- Never invent claims, prices, numbers or names that are not already in the film or in the instruction.
- If the instruction is unclear or refers to something not in the film, return no edits and explain in the summary.
- Changing a duration: whole seconds 1-30.
Always answer by calling the submit_edits tool.`;

export const editTool: ToolSpec = {
  name: "submit_edits",
  description: "Submit the edits to apply to the film.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One or two sentences on what was changed and why." },
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scene_id: { type: "string" },
            reason: { type: "string" },
            headline: { type: "string" },
            supportingText: { type: "string" },
            voiceover: { type: "string" },
            duration: { type: "integer", minimum: 1, maximum: 30 },
            visualQuery: { type: "string" },
          },
          required: ["scene_id"],
        },
      },
    },
    required: ["summary", "edits"],
  },
};

const numbersIn = (text: string) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];

/** Turns the model's answer into a plan that only touches known scenes, with limited, fact-checked values. */
export function sanitizeEdits(raw: unknown, scenes: EditableScene[], instruction = ""): EditPlan {
  const data = (raw && typeof raw === "object" ? raw : {}) as { summary?: unknown; edits?: unknown };
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const knownNumbers = new Set(numbersIn([instruction, ...scenes.flatMap((scene) => [scene.headline, scene.supportingText, scene.voiceover])].join(" ")));
  const merged = new Map<string, SceneEdit>();
  for (const item of Array.isArray(data.edits) ? data.edits : []) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const scene = typeof entry.scene_id === "string" ? byId.get(entry.scene_id) : undefined;
    if (!scene) continue;
    const changes: SceneChanges = {};
    for (const field of ["headline", "supportingText", "voiceover"] as const) {
      const value = entry[field];
      if (typeof value !== "string") continue;
      const text = value.replace(/\s+/g, " ").trim();
      if (!text && field === "headline") continue;
      if (text.length > limits[field] || text === scene[field]) continue;
      if (numbersIn(text).some((number) => !knownNumbers.has(number))) continue; // a number nobody supplied
      changes[field] = text;
    }
    if (typeof entry.visualQuery === "string" && /^[a-z0-9 ,'-]{3,60}$/i.test(entry.visualQuery.trim()) && entry.visualQuery.trim() !== scene.visualQuery) changes.visualQuery = entry.visualQuery.trim();
    if (typeof entry.duration === "number" && Number.isInteger(entry.duration) && entry.duration >= 1 && entry.duration <= 30 && entry.duration !== scene.duration) changes.duration = entry.duration;
    if (!Object.keys(changes).length) continue;
    const existing = merged.get(scene.id);
    merged.set(scene.id, { sceneId: scene.id, reason: String(entry.reason ?? existing?.reason ?? "").slice(0, 200), changes: { ...existing?.changes, ...changes } });
  }
  return { summary: String(data.summary ?? "").slice(0, 400), edits: [...merged.values()] };
}

export async function planEdit(
  input: { instruction: string; scenes: EditableScene[]; focusSceneId?: string; brand?: string; language?: string },
  call: typeof callTool = callTool,
): Promise<EditPlan> {
  const listing = input.scenes.map((scene, index) => ({ id: scene.id, number: index + 1, headline: scene.headline, supportingText: scene.supportingText, voiceover: scene.voiceover, duration: scene.duration, visualQuery: scene.visualQuery }));
  const focus = input.focusSceneId && input.scenes.some((scene) => scene.id === input.focusSceneId) ? `\nFocus scene id: ${input.focusSceneId}` : "";
  const head = JSON.stringify({ brand: input.brand ?? "", language: input.language ?? "", totalSeconds: input.scenes.reduce((sum, scene) => sum + scene.duration, 0) });
  const raw = await call({ system: editSystem, tool: editTool, maxTokens: 1500, content: `Film:\n${head}\n\nScenes:\n${JSON.stringify(listing)}${focus}\n\nInstruction: ${input.instruction}` });
  const mapped = { ...raw, edits: Array.isArray(raw.edits) ? raw.edits : [] };
  return sanitizeEdits(mapped, input.scenes, input.instruction);
}
