import { requestJson, jsonHeaders } from "./http";
import {
  ProviderError,
  type ModelSpec,
  type PollContext,
  type PollResult,
  type ProviderAdapter,
  type SubmitContext,
} from "./types";

/**
 * Runway — direct developer API (api.dev.runwayml.com). Image to video, and
 * start+end frame by sending two positioned prompt images.
 * Docs: https://docs.dev.runwayml.com
 */

const BASE = "https://api.dev.runwayml.com/v1";
const API_VERSION = process.env.RUNWAY_API_VERSION || "2024-11-06";

const headers = (secret: string) => ({ authorization: `Bearer ${secret}`, "x-runway-version": API_VERSION });

const RATIOS = ["1280:720", "720:1280", "1104:832", "832:1104", "960:960", "1584:672"].map((v) => ({ value: v, label: v }));
const RUNWAY_MODELS = [
  { value: "gen4_turbo", label: "Gen-4 Turbo" },
  { value: "gen3a_turbo", label: "Gen-3 Alpha Turbo" },
];

const shared = [
  { key: "model", label: "Model", type: "select" as const, default: "gen4_turbo", options: RUNWAY_MODELS },
  { key: "promptText", label: "Prompt", type: "textarea" as const, placeholder: "Describe the motion…" },
  { key: "ratio", label: "Ratio", type: "select" as const, default: "1280:720", options: RATIOS },
  {
    key: "duration",
    label: "Duration",
    type: "select" as const,
    default: "5",
    options: [
      { value: "5", label: "5 seconds" },
      { value: "10", label: "10 seconds" },
    ],
  },
];

const models: ModelSpec[] = [
  {
    id: "runway-i2v",
    label: "Runway image to video",
    capability: "video.image2video",
    fields: [{ key: "image", label: "Start frame", type: "image", required: true }, ...shared],
  },
  {
    id: "runway-startend",
    label: "Runway start + end frame",
    capability: "video.startEndFrame",
    fields: [
      { key: "image", label: "Start frame", type: "image", required: true },
      {
        key: "image_tail",
        label: "End frame",
        type: "image",
        help: "Optional — leave empty to animate from the start frame alone.",
      },
      ...shared,
    ],
  },
];

export const runwayProvider: ProviderAdapter = {
  id: "runway",
  label: "Runway",
  website: "https://dev.runwayml.com",
  docs: "https://docs.dev.runwayml.com",
  credential: { label: "API key", help: "Runway developer portal → API keys (key_...).", envVar: "RUNWAY_API_KEY" },
  models,

  async submit(ctx: SubmitContext) {
    const promptImage = ctx.media.image_tail
      ? [
          { uri: ctx.media.image.dataUri, position: "first" },
          { uri: ctx.media.image_tail.dataUri, position: "last" },
        ]
      : ctx.media.image.dataUri;

    ctx.log("runway: POST /image_to_video");
    const res = await requestJson<{ id: string }>(`${BASE}/image_to_video`, {
      method: "POST",
      label: "Runway image to video",
      headers: jsonHeaders(headers(ctx.credential.secret)),
      body: JSON.stringify({
        model: ctx.params.model ?? "gen4_turbo",
        promptImage,
        promptText: ctx.params.promptText || undefined,
        ratio: ctx.params.ratio ?? "1280:720",
        duration: Number(ctx.params.duration ?? 5),
      }),
    });
    if (!res.id) throw new ProviderError("Runway returned no task id");
    return { kind: "async", taskId: res.id };
  },

  async poll(ctx: PollContext): Promise<PollResult> {
    const res = await requestJson<{ status: string; output?: string[]; failure?: string; progress?: number }>(
      `${BASE}/tasks/${encodeURIComponent(ctx.taskId)}`,
      { label: "Runway task status", headers: headers(ctx.credential.secret) },
    );
    if (res.status === "FAILED") return { status: "failed", error: res.failure || "Runway reported the task failed" };
    if (res.status !== "SUCCEEDED") {
      return { status: "running", progress: res.progress ? Math.round(res.progress * 100) : undefined, message: res.status };
    }
    const outputs = (res.output ?? []).map((url, i) => ({
      kind: "VIDEO" as const,
      mimeType: "video/mp4",
      name: `runway-${i + 1}.mp4`,
      url,
    }));
    if (!outputs.length) return { status: "failed", error: "Runway reported success but returned no output" };
    return { status: "succeeded", outputs };
  },
};
