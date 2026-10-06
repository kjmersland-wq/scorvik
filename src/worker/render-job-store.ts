import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { VideoProject } from "../types/project.ts";

export type WorkerRenderStatus = "queued" | "processing" | "complete" | "failed";

export interface WorkerRenderRecord {
  renderId: string;
  idempotencyKey: string;
  status: WorkerRenderStatus;
  progress: number;
  project: VideoProject;
  outputKey?: string;
  errorCode?: string;
  errorMessage?: string;
  updatedAt: string;
}

interface RenderJobRow {
  render_id: string;
  idempotency_key: string;
  status: WorkerRenderStatus;
  progress: number;
  project_json: VideoProject;
  output_key: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: Date | string;
}

export interface RenderJobStore {
  enqueue(project: VideoProject, idempotencyKey: string, renderId: string): Promise<WorkerRenderRecord>;
  get(renderId: string): Promise<WorkerRenderRecord | undefined>;
  claimNext(staleBefore: Date): Promise<WorkerRenderRecord | undefined>;
  updateProgress(renderId: string, progress: number): Promise<void>;
  complete(renderId: string, outputKey: string): Promise<boolean>;
  fail(renderId: string, errorCode: string, errorMessage: string): Promise<void>;
}

function mapRow(row: RenderJobRow): WorkerRenderRecord {
  return {
    renderId: row.render_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    progress: Number(row.progress),
    project: row.project_json,
    outputKey: row.output_key ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class NeonRenderJobStore implements RenderJobStore {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor(connectionString: string) {
    this.sql = neon<false, false>(connectionString);
  }

  async enqueue(project: VideoProject, idempotencyKey: string, renderId: string): Promise<WorkerRenderRecord> {
    const rows = await this.sql`
      INSERT INTO render_jobs (render_id, idempotency_key, status, progress, project_json)
      VALUES (${renderId}::uuid, ${idempotencyKey}, 'queued', 0, ${JSON.stringify(project)}::jsonb)
      ON CONFLICT (idempotency_key) DO UPDATE SET
        render_id = CASE WHEN render_jobs.status = 'failed' THEN EXCLUDED.render_id ELSE render_jobs.render_id END,
        status = CASE WHEN render_jobs.status = 'failed' THEN 'queued' ELSE render_jobs.status END,
        progress = CASE WHEN render_jobs.status = 'failed' THEN 0 ELSE render_jobs.progress END,
        project_json = CASE WHEN render_jobs.status = 'failed' THEN EXCLUDED.project_json ELSE render_jobs.project_json END,
        output_key = CASE WHEN render_jobs.status = 'failed' THEN NULL ELSE render_jobs.output_key END,
        error_code = CASE WHEN render_jobs.status = 'failed' THEN NULL ELSE render_jobs.error_code END,
        error_message = CASE WHEN render_jobs.status = 'failed' THEN NULL ELSE render_jobs.error_message END,
        updated_at = CASE WHEN render_jobs.status = 'failed' THEN NOW() ELSE render_jobs.updated_at END
      RETURNING *
    `;
    return mapRow(rows[0] as RenderJobRow);
  }

  async get(renderId: string): Promise<WorkerRenderRecord | undefined> {
    const rows = await this.sql`SELECT * FROM render_jobs WHERE render_id = ${renderId}::uuid LIMIT 1`;
    return rows[0] ? mapRow(rows[0] as RenderJobRow) : undefined;
  }

  async claimNext(staleBefore: Date): Promise<WorkerRenderRecord | undefined> {
    const rows = await this.sql`
      UPDATE render_jobs
      SET status = 'processing', progress = GREATEST(progress, 1), updated_at = NOW()
      WHERE render_id = (
        SELECT render_id FROM render_jobs
        WHERE status = 'queued' OR (status = 'processing' AND updated_at < ${staleBefore.toISOString()})
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `;
    return rows[0] ? mapRow(rows[0] as RenderJobRow) : undefined;
  }

  async updateProgress(renderId: string, progress: number): Promise<void> {
    await this.sql`
      UPDATE render_jobs SET progress = ${Math.max(1, Math.min(99, Math.floor(progress)))}, updated_at = NOW()
      WHERE render_id = ${renderId}::uuid AND status = 'processing'
    `;
  }

  async complete(renderId: string, outputKey: string): Promise<boolean> {
    const rows = await this.sql`
      UPDATE render_jobs
      SET status = 'complete', progress = 100, output_key = ${outputKey}, error_code = NULL, error_message = NULL, updated_at = NOW()
      WHERE render_id = ${renderId}::uuid AND status = 'processing'
      RETURNING render_id
    `;
    return rows.length === 1;
  }

  async fail(renderId: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.sql`
      UPDATE render_jobs
      SET status = 'failed', error_code = ${errorCode.slice(0, 80)}, error_message = ${errorMessage.slice(0, 500)}, updated_at = NOW()
      WHERE render_id = ${renderId}::uuid AND status IN ('queued', 'processing')
    `;
  }
}