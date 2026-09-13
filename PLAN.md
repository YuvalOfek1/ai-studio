# AI Studio — architecture plan

A local-first "one stop shop" for generative media: images, video (text→video,
image→video, start-frame→video, start+end-frame→video), voice-over / dubbing with a
cloned voice, and lip-sync — all driven from a project workstation and a drag-and-drop
node flow editor, persisted in Postgres.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Model access | **Direct vendor APIs** (Kling, ElevenLabs, OpenAI, Google, MiniMax, Runway, BFL) | No aggregator commission — you pay vendor list price. |
| Stack | **Next.js 15 (App Router) + TypeScript**, one codebase for UI + API | Single process to run locally, trivially deployable to a VM later. |
| DB | **Postgres 16 + Prisma** in Docker | Real relational persistence, migrations, easy backup. |
| Queue | **BullMQ + Redis** in Docker, separate worker process | Generations take 30s–5min; HTTP requests must not hold them. |
| Media | Storage driver: **local disk** (default) or **S3/MinIO** | Media never belongs in Postgres; local disk keeps it simple now, S3 for the cloud VM later. |
| Canvas | **@xyflow/react (React Flow 12)** | Standard for node editors; typed handles, pan/zoom, minimap. |
| Live updates | **SSE** (`/api/events`) | Job status/progress streams to the UI without polling loops in every component. |

## Layout

```
ai-studio/
  docker-compose.yml        postgres + redis (+ optional app/worker profile)
  prisma/schema.prisma      Project, Asset, Job, Workflow, WorkflowRun, Credential, Voice
  src/
    app/                    UI routes + /api REST routes
    components/             shell, workstation, gallery, flow canvas
    lib/
      providers/            ONE FILE PER VENDOR — all HTTP lives here
      engine/               node definitions + topological graph runner
      jobs/                 submit → poll → download → persist pipeline
      storage.ts db.ts queue.ts crypto.ts
  worker/index.ts           BullMQ worker (separate `npm run worker`)
```

## Capability model

The UI never speaks to a vendor. It asks for a **capability**; the registry lists every
model that can serve it, and the adapter translates params.

| Capability | Meaning | Direct providers |
| --- | --- | --- |
| `image.generate` | text → image | OpenAI `gpt-image-1`, BFL Flux, Kling |
| `image.edit` | image(+mask) → image | OpenAI, BFL |
| `video.text2video` | text → video | Kling, MiniMax, Google Veo |
| `video.image2video` | start frame → video | Kling, MiniMax, Runway |
| `video.startEndFrame` | start + end frame → video | Kling (`image_tail`), MiniMax |
| `video.extend` | extend an existing video | Kling |
| `video.lipsync` | video + audio → lip-synced video | Kling |
| `audio.tts` | text → speech | ElevenLabs |
| `audio.voiceClone` | mp3 sample → reusable voice | ElevenLabs IVC |
| `audio.dub` | media + target language → dubbed media | ElevenLabs Dubbing |

Adding a vendor = one file in `lib/providers/` + one registry entry. Nothing else changes.

## Job lifecycle

1. API creates a `Job` row (`QUEUED`) and enqueues it.
2. Worker resolves provider + credential, calls `submit()` → vendor task id (`RUNNING`).
3. Worker polls `poll()` on a backoff until terminal.
4. Worker downloads the result, writes it through the storage driver, creates `Asset` rows.
5. `SUCCEEDED` (or `FAILED` with the vendor error). SSE pushes every transition to the UI.

## Flow engine

A workflow is a saved `{nodes, edges}` graph. Running it creates a `WorkflowRun`, sorts
nodes topologically, and executes each: source nodes resolve constants/assets, generation
nodes create real `Job`s and await them, and outputs flow along edges into downstream
inputs. Ports are typed (`text`, `image`, `video`, `audio`, `voice`) so the canvas refuses
invalid connections.

## Running without keys

A built-in `mock` provider implements every capability and returns generated placeholder
media. The whole system — queue, flow engine, gallery — is exercisable with zero API keys
and zero spend. Real adapters are swapped in by pasting keys into Settings.
