import { SignJWT } from "jose";
import { requestJson, jsonHeaders } from "./http";
import {
  ProviderError,
  type Field,
  type ModelSpec,
  type PollContext,
  type PollResult,
  type ProviderAdapter,
  type ProviderOutput,
  type SubmitContext,
} from "./types";

/**
 * Kling AI (Kuaishou) — direct open-platform API, no reseller in between.
 *
 * Auth: a short lived HS256 JWT signed with your secret key, `iss` = access key.
 * Credential is stored as "accessKey:secretKey".
 * Every generation endpoint is async: POST returns a task id, GET polls it.
 * Docs: https://app.klingai.com/global/dev/document-api
 */

const BASE_URL = () => process.env.KLING_BASE_URL?.replace(/\/$/, "") || "https://api-singapore.klingai.com";

async function bearer(secret: string): Promise<string> {
  const [accessKey, secretKey] = secret.split(":");
  if (!accessKey || !secretKey) {
    throw new ProviderError('Kling credential must be "accessKey:secretKey" (from the Kling console → API management).');
  }
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: accessKey })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 1800)
    .setNotBefore(now - 5)
    .sign(new TextEncoder().encode(secretKey));
}

interface KlingEnvelope<T> {
  code: number;
  message: string;
  request_id: string;
  data: T;
}

interface KlingTask {
  task_id: string;
  task_status: "submitted" | "processing" | "succeed" | "failed";
  task_status_msg?: string;
  task_result?: {
    images?: { index: number; url: string }[];
    videos?: { id: string; url: string; duration: string }[];
  };
}

function unwrap<T>(res: KlingEnvelope<T>, label: string): T {
  if (res.code !== 0) throw new ProviderError(`${label}: ${res.message} (code ${res.code})`);
  return res.data;
}

/** Kling wants raw base64 without the data: prefix, or a public URL. */
const raw = (dataUri: string) => dataUri.split(",")[1] ?? dataUri;

const prompt: Field = { key: "prompt", label: "Prompt", type: "textarea", required: true, placeholder: "Describe the shot, camera move and mood…" };
const negative: Field = { key: "negative_prompt", label: "Negative prompt", type: "text", placeholder: "blurry, distorted, watermark" };
const cfg: Field = { key: "cfg_scale", label: "Prompt adherence", type: "number", default: 0.5, min: 0, max: 1, step: 0.1, help: "0 = loose, 1 = literal." };
const mode: Field = {
  key: "mode",
  label: "Quality",
  type: "select",
  default: "std",
  options: [
    { value: "std", label: "Standard (cheaper)" },
    { value: "pro", label: "Professional" },
  ],
};
const duration: Field = {
  key: "duration",
  label: "Duration",
  type: "select",
  default: "5",
  options: [
    { value: "5", label: "5 seconds" },
    { value: "10", label: "10 seconds" },
  ],
};
const aspect: Field = {
  key: "aspect_ratio",
  label: "Aspect ratio",
  type: "select",
  default: "16:9",
  options: ["16:9", "9:16", "1:1"].map((v) => ({ value: v, label: v })),
};

const VIDEO_MODELS = [
  { value: "kling-v2-1-master", label: "Kling 2.1 Master" },
  { value: "kling-v2-master", label: "Kling 2.0 Master" },
  { value: "kling-v1-6", label: "Kling 1.6" },
  { value: "kling-v1", label: "Kling 1.0" },
];

const modelName = (): Field => ({
  key: "model_name",
  label: "Model version",
  type: "select",
  default: VIDEO_MODELS[0].value,
  options: VIDEO_MODELS,
});

const models: ModelSpec[] = [
  {
    id: "kling-image",
    label: "Kling image",
    capability: "image.generate",
    price: "per image, billed by Kling",
    fields: [
      prompt,
      negative,
      { key: "n", label: "Number of images", type: "number", default: 1, min: 1, max: 9, step: 1 },
      aspect,
    ],
  },
  {
    id: "kling-text2video",
    label: "Kling text to video",
    capability: "video.text2video",
    price: "per clip, billed by Kling",
    fields: [modelName(), prompt, negative, mode, duration, aspect, cfg],
  },
  {
    id: "kling-image2video",
    label: "Kling image to video",
    capability: "video.image2video",
    price: "per clip, billed by Kling",
    fields: [modelName(), { key: "image", label: "Start frame", type: "image", required: true }, prompt, negative, mode, duration, cfg],
  },
  {
    id: "kling-startend",
    label: "Kling start + end frame",
    capability: "video.startEndFrame",
    description: "Kling interpolates between the two frames you provide.",
    price: "per clip, billed by Kling",
    fields: [
      { key: "model_name", label: "Model version", type: "select", default: "kling-v1-6", options: VIDEO_MODELS },
      { key: "image", label: "Start frame", type: "image", required: true },
      { key: "image_tail", label: "End frame", type: "image", required: true },
      prompt,
      negative,
      mode,
      duration,
      cfg,
    ],
  },
  {
    id: "kling-lipsync",
    label: "Kling lip sync",
    capability: "video.lipsync",
    fields: [
      { key: "video", label: "Video with a face", type: "video", required: true },
      { key: "audio", label: "Audio track", type: "audio", required: true },
    ],
  },
];

/** Which REST path a capability submits to and polls. */
function pathFor(capability: string): string {
  switch (capability) {
    case "image.generate":
      return "/v1/images/generations";
    case "video.text2video":
      return "/v1/videos/text2video";
    case "video.image2video":
    case "video.startEndFrame":
      return "/v1/videos/image2video";
    case "video.lipsync":
      return "/v1/videos/lip-sync";
    case "video.extend":
      return "/v1/videos/video-extend";
    default:
      throw new ProviderError(`Kling does not serve ${capability}`);
  }
}

function buildBody(ctx: SubmitContext): Record<string, unknown> {
  const p = ctx.params;
  switch (ctx.model.capability) {
    case "image.generate":
      return {
        model_name: "kling-v1-5",
        prompt: p.prompt,
        negative_prompt: p.negative_prompt || undefined,
        n: Number(p.n ?? 1),
        aspect_ratio: p.aspect_ratio ?? "16:9",
      };
    case "video.text2video":
      return {
        model_name: p.model_name,
        prompt: p.prompt,
        negative_prompt: p.negative_prompt || undefined,
        cfg_scale: Number(p.cfg_scale ?? 0.5),
        mode: p.mode ?? "std",
        aspect_ratio: p.aspect_ratio ?? "16:9",
        duration: String(p.duration ?? "5"),
      };
    case "video.image2video":
    case "video.startEndFrame":
      return {
        model_name: p.model_name,
        image: raw(ctx.media.image.dataUri),
        image_tail: ctx.media.image_tail ? raw(ctx.media.image_tail.dataUri) : undefined,
        prompt: p.prompt || undefined,
        negative_prompt: p.negative_prompt || undefined,
        cfg_scale: Number(p.cfg_scale ?? 0.5),
        mode: p.mode ?? "std",
        duration: String(p.duration ?? "5"),
      };
    case "video.lipsync":
      return {
        input: {
          mode: "audio2video",
          video_url: undefined,
          audio_type: "file",
          audio_file: raw(ctx.media.audio.dataUri),
        },
      };
    default:
      throw new ProviderError(`Kling does not serve ${ctx.model.capability}`);
  }
}

function outputsFrom(task: KlingTask): ProviderOutput[] {
  const images = (task.task_result?.images ?? []).map((img) => ({
    kind: "IMAGE" as const,
    mimeType: "image/png",
    url: img.url,
    name: `kling-${img.index}.png`,
  }));
  const videos = (task.task_result?.videos ?? []).map((video) => ({
    kind: "VIDEO" as const,
    mimeType: "video/mp4",
    url: video.url,
    name: `kling-${video.id}.mp4`,
    meta: { durationSeconds: Number(video.duration) || undefined, providerVideoId: video.id },
  }));
  return [...images, ...videos];
}

export const klingProvider: ProviderAdapter = {
  id: "kling",
  label: "Kling AI",
  website: "https://app.klingai.com",
  docs: "https://app.klingai.com/global/dev/document-api",
  credential: {
    label: "Access key : Secret key",
    help: 'Paste as "accessKey:secretKey" from the Kling console → API management.',
    envVar: "KLING_API_KEY",
  },
  models,
  async submit(ctx: SubmitContext) {
    const path = pathFor(ctx.model.capability);
    const token = await bearer(ctx.credential.secret);
    ctx.log(`kling: POST ${path}`);
    const res = await requestJson<KlingEnvelope<KlingTask>>(`${BASE_URL()}${path}`, {
      method: "POST",
      label: `Kling ${ctx.model.capability}`,
      headers: jsonHeaders({ authorization: `Bearer ${token}` }),
      body: JSON.stringify(buildBody(ctx)),
    });
    const task = unwrap(res, "Kling submit");
    return { kind: "async", taskId: task.task_id, meta: { path } };
  },
  async poll(ctx: PollContext): Promise<PollResult> {
    const path = String(ctx.meta.path ?? pathFor(ctx.model.capability));
    const token = await bearer(ctx.credential.secret);
    const res = await requestJson<KlingEnvelope<KlingTask>>(`${BASE_URL()}${path}/${ctx.taskId}`, {
      label: "Kling poll",
      headers: { authorization: `Bearer ${token}` },
    });
    const task = unwrap(res, "Kling poll");
    if (task.task_status === "failed") {
      return { status: "failed", error: task.task_status_msg || "Kling reported the task failed" };
    }
    if (task.task_status === "succeed") {
      const outputs = outputsFrom(task);
      if (!outputs.length) return { status: "failed", error: "Kling reported success but returned no media" };
      return { status: "succeeded", outputs };
    }
    return { status: "running", message: task.task_status_msg };
  },
};
