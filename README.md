# SCORVIK

SCORVIK turns the story already present on a website into a storyboard and a video preview. This release is a complete, local mock workflow built with Next.js App Router, React, and strict TypeScript.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Use **Create a video**, choose a sample URL or paste another address, edit the storyboard, and generate a mock first cut. Projects are saved in this browser's local storage.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Routes

- `/` Product landing page
- `/create` Website analysis, storyboard editor, settings, and mock render
- `/projects` Local creative library
- `/projects/[id]` Project and storyboard detail
- `/how-it-works` Workflow overview
- `/pricing` Demo-mode pricing information

## Architecture

- `src/types/project.ts` defines project, site analysis, scene, video settings, and provider contracts.
- `src/lib/mock-data.ts` creates deterministic demo analysis and storyboard content without credentials or external APIs.
- `src/lib/projects.ts` stores project snapshots in browser local storage and exposes them as a React external store.
- `src/components/create-studio.tsx` owns the user-facing create flow; the landing, library, and project detail are isolated components.
- Provider interfaces are deliberately separate from the UI so ingestion, storyboard, and rendering implementations can be swapped later.

## Website ingestion

`POST /api/website/analyze` accepts a URL and `mode: "real" | "mock"`. Real mode runs the server-only `WebsiteIngestionService` pipeline: URL normalization and safety validation, bounded HTML fetch, metadata/content extraction, brand profiling, deterministic creative brief generation, and category-adaptive storyboard generation. Mock mode returns the same typed result shape without contacting the submitted host.

The fetch layer allows only HTTP/HTTPS, rejects credentials, IP literals and internal hostnames, resolves DNS and rejects a hostname if any answer is non-public, pins the request socket to a validated address, revalidates every redirect, blocks HTTPS downgrade, limits redirects/time and response bytes, and accepts HTML/XHTML only. User-facing API errors are normalized. This is a defense-in-depth baseline; production deployment should also apply outbound network egress rules, abuse/rate limits, and operational monitoring.

## Creative and production systems

- `src/lib/creative/create-brief.ts` derives a conservative brand/category profile and brief from extracted evidence; it does not call an AI service or invent proof points.
- `src/lib/creative/storyboard-engine.ts` uses distinct scene structures for SaaS, ecommerce, restaurants, travel, services, content, and general sites.
- `src/lib/music/taxonomy.ts` defines genre/subgenre, style, mood, energy, tempo and instrumentation discovery.
- `src/lib/music/recommend.ts` ranks Scorvik Original Music and external candidates deterministically by category, tone, mood, genre, tempo, duration, voiceover, usage, platform and storyboard fit. Local originals include structured metadata and are assigned a configurable preference only when they pass the strong-match threshold. Their Suno plan terms must be confirmed before commercial publication.
- `PIXABAY_API_KEY` is reserved as a server-only environment variable. Pixabay's published API documentation currently specifies image and video endpoints, but no music-search endpoint or music-track response schema; the application does not call an undocumented endpoint or expose this key.
- `src/lib/audio/mix.ts` defines independent voice/music/SFX/jingle levels, ducking, duration fit and fades. Short-track looping requires license verification and editorial review.
- `src/lib/platforms/presets.ts` defines output dimensions, safe areas and caption behavior for YouTube, Shorts, Instagram, Facebook, TikTok and square output.

## Video rendering

Local development uses system `ffmpeg` and `ffprobe` (`FFMPEG_PATH` and `FFPROBE_PATH` can override executable names). It creates real H.264/AAC MP4 files from storyboard-selected website images, with purpose-based zoom/pan, crossfades, safe text overlays, exact target duration, and the selected locally available music track when present. Voice selection remains metadata; no voice audio is synthesized. Local MP4s and job records live in `.scorvik-renders/`, are excluded from Git, and stream through the authenticated render API with byte-range support.

Production keeps Vercel as the authenticated API/orchestration layer and runs the same FFmpeg engine in the dedicated Docker worker at `worker/Dockerfile`. The worker persists queued jobs, project payloads, state and progress in the single Neon `render_jobs` table defined by `migrations/vercel/0002_render_jobs.sql`, then uploads a verified MP4 to the private Cloudflare R2 bucket `scorvik-videos` before marking the job complete. Vercel proxies status and authenticated byte-range video requests to the worker; bucket credentials and the worker bearer token are never sent to the browser. Apply that migration to the worker's Neon database before starting it; it is additive and safe to rerun.

Deploy the repository-root Docker build as a persistent background web service with at least 4 vCPU and 8 GB memory for the initial 1080p test; keep worker concurrency at one until measured. Set `DATABASE_URL`, `SCORVIK_RENDER_PROVIDER_TOKEN`, `SCORVIK_RENDER_WORKER_PUBLIC_URL`, `SCORVIK_R2_ACCOUNT_ID`, `SCORVIK_R2_ACCESS_KEY_ID`, `SCORVIK_R2_SECRET_ACCESS_KEY`, and `SCORVIK_R2_BUCKET=scorvik-videos` on the worker. Set `SCORVIK_RENDER_PROVIDER_URL` to the worker's HTTPS base URL and the same `SCORVIK_RENDER_PROVIDER_TOKEN` in Vercel. Render persistence uses Neon only from the worker; setting `DATABASE_URL` in Vercel is not required for rendering. If Vercel's existing auth persistence is enabled with `DATABASE_URL`, apply its separate existing `migrations/vercel/0001_auth.sql` as documented in the authentication section. The R2 bucket stays private. Worker-local files are only intermediate; the complete MP4 is durable in R2.

Vercel does not run FFmpeg for production jobs. Until the worker, Neon table, R2 bucket and Vercel variables are configured, production render requests fail honestly as unavailable. Supported existing durations and aspect ratios continue through the shared renderer validation and encoder.

## Private preview authentication

The private preview is Vercel-first and uses the existing `SCORVIK_PREVIEW_EMAIL`, `SCORVIK_PREVIEW_PASSWORD`, and `SCORVIK_AUTH_SECRET` server variables for bootstrap login and signed HTTP-only sessions. Login does not require a database. When `DATABASE_URL` is configured, the Neon serverless store persists a PBKDF2 password hash, single-use reset-token hashes, rate limits, and session versions. A stored password hash takes precedence over the bootstrap password.

To enable persistent reset and password changes, create a Neon Postgres database, set `DATABASE_URL` in Vercel, and apply `migrations/vercel/0001_auth.sql` with the Neon SQL Editor. This migration only creates tables and indexes; it does not drop data. Without `DATABASE_URL`, bootstrap login continues to work while reset and password changes safely remain unavailable in production.

Reset links use cryptographically random tokens; only their SHA-256 hashes are stored, they expire after 20 minutes, and credential session-version changes invalidate previous links and sessions. Local `next dev` shows the reset URL only on the development response page. Production email delivery is disabled until `RESEND_API_KEY` and `SCORVIK_EMAIL_FROM` are configured. `SCORVIK_APP_URL` can set the reset-link origin; otherwise the Vercel deployment URL is used. The server-side `PasswordResetEmailProvider` keeps email delivery replaceable.

`migrations/0001_private_preview_auth.sql` is the historical Cloudflare D1 auth migration and is no longer used by the application. The Vercel auth runtime does not import OpenNext, Wrangler, or D1. Existing Cloudflare resources are left untouched.

## Visual system

The app uses a near-black production-console surface, warm ivory editorial typography, DM Serif Display headlines, compact DM Sans controls, mono technical labels, thin borders and a restrained orange-red accent. `src/app/dark-studio.css` is the shared theme layer for the landing page, creation studio, music panel, project library and supporting routes. Hover/focus feedback uses short CSS transitions; reduced-motion preferences are respected. The landing workbench sends its URL and output choices into `/create` as query parameters.

## Demo limits

Mock mode does not fetch the submitted website or generate an MP4. It uses sample brand content and curated remote photography to demonstrate analysis, editing, and project history. Real mode performs server-side public HTML extraction, but many sites block automated access or depend on client-side rendering. Local development can generate real MP4s with FFmpeg. Production rendering requires the dedicated worker, its Neon/R2 configuration, and the Vercel provider variables described above. Scorvik Original music files are available locally; commercial-use grants require confirmation against the applicable Suno plan. Pixabay music search is not connected because its published developer API documents no music endpoint. Voice generation, SFX/jingle assets, customer accounts, subscriptions, and storage synchronization are not connected. Projects are browser-local and are not shared across devices.
