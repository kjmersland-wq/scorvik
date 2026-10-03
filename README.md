# SiteRender-AI

SiteRender turns the story already present on a website into a storyboard and a video preview. This first release is a complete, local mock workflow built with Next.js App Router, React, and strict TypeScript.

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
- `src/lib/music/recommend.ts` ranks candidates deterministically by brand fit, mood, genre, tempo and duration. Current music catalog items are metadata demonstrations only: they have no audio URL, usage grant, or commercial rights and must not be used in production.
- `src/lib/audio/mix.ts` defines independent voice/music/SFX/jingle levels, ducking, duration fit and fades. Short-track looping requires license verification and editorial review.
- `src/lib/platforms/presets.ts` defines output dimensions, safe areas and caption behavior for YouTube, Shorts, Instagram, Facebook, TikTok and square output.

## Visual system

The app uses a near-black production-console surface, warm ivory editorial typography, DM Serif Display headlines, compact DM Sans controls, mono technical labels, thin borders and a restrained orange-red accent. `src/app/dark-studio.css` is the shared theme layer for the landing page, creation studio, music panel, project library and supporting routes. Hover/focus feedback uses short CSS transitions; reduced-motion preferences are respected. The landing workbench sends its URL and output choices into `/create` as query parameters.

## Demo limits

Mock mode does not fetch the submitted website or generate an MP4. It uses sample brand content and curated remote photography to demonstrate analysis, editing, render progress, and project history. The download action exports a JSON project file, not a video file. Real mode performs server-side public HTML extraction, but many sites block automated access or depend on client-side rendering. Music tracks currently have no audio files or cleared licenses. Voice, SFX, jingle assets, real FFmpeg/provider renders, user accounts, storage synchronization, rate limiting, and paid APIs are not connected. Projects are browser-local and are not shared across devices.
