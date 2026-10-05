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

## Private preview authentication

The private preview is Vercel-first and uses the existing `SCORVIK_PREVIEW_EMAIL`, `SCORVIK_PREVIEW_PASSWORD`, and `SCORVIK_AUTH_SECRET` server variables for bootstrap login and signed HTTP-only sessions. Login does not require a database. When `DATABASE_URL` is configured, the Neon serverless store persists a PBKDF2 password hash, single-use reset-token hashes, rate limits, and session versions. A stored password hash takes precedence over the bootstrap password.

To enable persistent reset and password changes, create a Neon Postgres database, set `DATABASE_URL` in Vercel, and apply `migrations/vercel/0001_auth.sql` with the Neon SQL Editor. This migration only creates tables and indexes; it does not drop data. Without `DATABASE_URL`, bootstrap login continues to work while reset and password changes safely remain unavailable in production.

Reset links use cryptographically random tokens; only their SHA-256 hashes are stored, they expire after 20 minutes, and credential session-version changes invalidate previous links and sessions. Local `next dev` shows the reset URL only on the development response page. Production email delivery is disabled until `RESEND_API_KEY` and `SCORVIK_EMAIL_FROM` are configured. `SCORVIK_APP_URL` can set the reset-link origin; otherwise the Vercel deployment URL is used. The server-side `PasswordResetEmailProvider` keeps email delivery replaceable.

`migrations/0001_private_preview_auth.sql` is the historical Cloudflare D1 auth migration and is no longer used by the application. The Vercel auth runtime does not import OpenNext, Wrangler, or D1. Existing Cloudflare resources are left untouched.

## Visual system

The app uses a near-black production-console surface, warm ivory editorial typography, DM Serif Display headlines, compact DM Sans controls, mono technical labels, thin borders and a restrained orange-red accent. `src/app/dark-studio.css` is the shared theme layer for the landing page, creation studio, music panel, project library and supporting routes. Hover/focus feedback uses short CSS transitions; reduced-motion preferences are respected. The landing workbench sends its URL and output choices into `/create` as query parameters.

## Demo limits

Mock mode does not fetch the submitted website or generate an MP4. It uses sample brand content and curated remote photography to demonstrate analysis, editing, render progress, and project history. The download action exports a JSON project file, not a video file. Real mode performs server-side public HTML extraction, but many sites block automated access or depend on client-side rendering. Scorvik Original music files are available locally; commercial-use grants require confirmation against the applicable Suno plan. Pixabay music search is not connected because its published developer API documents no music endpoint. Voice, SFX, jingle assets, real FFmpeg/provider renders, customer accounts, subscriptions, storage synchronization, and paid APIs are not connected. Projects are browser-local and are not shared across devices.
