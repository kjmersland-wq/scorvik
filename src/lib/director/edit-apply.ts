// Types and the pure apply step: safe to import from browser code (no Node or network modules in here).
export interface EditableScene { id: string; headline: string; supportingText: string; voiceover: string; duration: number; visualQuery?: string }
export interface SceneChanges { headline?: string; supportingText?: string; voiceover?: string; duration?: number; visualQuery?: string }
export interface SceneEdit { sceneId: string; reason: string; changes: SceneChanges }
export interface EditPlan { summary: string; edits: SceneEdit[] }

export function applyEdits<T extends EditableScene>(scenes: T[], plan: EditPlan): T[] {
  const edits = new Map(plan.edits.map((edit) => [edit.sceneId, edit.changes]));
  return scenes.map((scene) => edits.has(scene.id) ? { ...scene, ...edits.get(scene.id) } : scene);
}

