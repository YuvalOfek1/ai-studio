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
 * Google Gemini API — Veo for video, Imagen for stills. Direct, key in the query
 * string. Veo is a long running operation you poll by name.
 * Docs: https://ai.google.dev/gemini-api/docs/video
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const VEO_MODELS = [
  { value: "veo-3.0-generate-001", label: "Veo 3 (with audio)" },
  { value: "veo-3.0-fast-generate-001", label: "Veo 3 Fast" },
  { value: "veo-2.0-generate-001", label: "Veo 2" },
];

const ASPECT = ["16:9", "9:16"].map((v) => ({ value: v, label: v }));

const models: ModelSpec[] = [
  {
    id: "veo-text2video",
    label: "Veo text to video",
    capability: "video.text2video",
    description: "Veo 3 generates a synced soundtrack with the clip.",
    fields: [
      { key: "model", label: "Model", type: "select", default: VEO_MODELS[0].value, options: VEO_MODELS },
      { key: "prompt", label: "Prompt", type: "textarea", required: true },
      { key: "negativePrompt", label: "Negative prompt", type: "text" },
      { key: "aspectRatio", label: "Aspect ratio", type: "select", default: "16:9", options: ASPECT },
    ],
  },
  {
    id: "veo-image2video",
    label: "Veo image to video",
    capability: "video.image2video",
    fields: [
      { key: "model", label: "Model", type: "select", default: VEO_MODELS[0].value, options: VEO_MODELS },
      { key: "image", label: "Start frame", type: "image", required: true },
      { key: "prompt", label: "Prompt", type: "textarea", required: true },
      { key: "aspectRatio", label: "Aspect ratio", type: "select", default: "16:9", options: ASPECT },
    ],
  },
  {
    id: "imagen-4",
    label: "Imagen 4",
    capability: "image.generate",
    fields: [
      {
        key: "model",
        label: "Model",
        type: "select",
        default: "imagen-4.0-generate-001",
        options: [
          { value: "imagen-4.0-generate-001", label: "Imagen 4" },
          { value: "imagen-4.0-ultra-generate-001", label: "Imagen 4 Ultra" },
          { value: "imagen-4.0-fast-generate-001", label: "Imagen 4 Fast" },
        ],
      },
      { key: "prompt", label: "Prompt", type: "textarea", required: true },
      { key: "sampleCount", label: "Number of images", type: "number", default: 1, min: 1, max: 4, step: 1 },
      { key: "aspectRatio", label: "Aspect ratio", type: "select", default: "1:1", options: ["1:1", "3:4", "4:3", "9:16", "16:9"].map((v) => ({ value: v, label: v })) },
    ],
  },
];

export const googleProvider: ProviderAdapter = {
  id: "google",
  label: "Google (Veo / Imagen)",
  website: "https://aistudio.google.com",
  docs: "https://ai.google.dev/gemini-api/docs/video",
  credential: { label: "API key", help: "Google AI Studio → Get API key.", envVar: "GOOGLE_API_KEY" },
  models,

  async submit(ctx: SubmitContext) {
    const key = encodeURIComponent(ctx.credential.secret);

    if (ctx.model.capability === "image.generate") {
      const model = String(ctx.params.model ?? "imagen-4.0-generate-001");
      ctx.log(`google: ${model}:predict`);
      const res = await requestJson<{ predictions: { bytesBase64Encoded: string; mimeType?: string }[] }>(
        `${BASE}/models/${model}:predict?key=${key}`,
        {
          method: "POST",
          label: "Imagen generate",
          headers: jsonHeaders(),
          body: JSON.stringify({
            instances: [{ prompt: ctx.params.prompt }],
            parameters: {
              sampleCount: Number(ctx.params.sampleCount ?? 1),
              aspectRatio: ctx.params.aspectRatio ?? "1:1",
            },
          }),
        },
      );
      const outputs = (res.predictions ?? []).map((p, i) => ({
        kind: "IMAGE" as const,
        mimeType: p.mimeType ?? "image/png",
        name: `imagen-${i + 1}.png`,
        data: Buffer.from(p.bytesBase64Encoded, "base64"),
      }));
      if (!outputs.length) throw new ProviderError("Imagen returned no images");
      return { kind: "done", outputs };
    }

    const model = String(ctx.params.model ?? VEO_MODELS[0].value);
    const instance: Record<string, unknown> = { prompt: ctx.params.prompt };
    if (ctx.media.image) {
      instance.image = { bytesBase64Encoded: ctx.media.image.base64, mimeType: ctx.media.image.mimeType };
    }
    ctx.log(`google: ${model}:predictLongRunning`);
    const res = await requestJson<{ name: string }>(`${BASE}/models/${model}:predictLongRunning?key=${key}`, {
      method: "POST",
      label: "Veo generate",
      headers: jsonHeaders(),
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: ctx.params.aspectRatio ?? "16:9",
          negativePrompt: ctx.params.negativePrompt || undefined,
        },
      }),
    });
    if (!res.name) throw new ProviderError("Veo returned no operation name");
    return { kind: "async", taskId: res.name };
  },

  async poll(ctx: PollContext): Promise<PollResult> {
    const key = encodeURIComponent(ctx.credential.secret);
    const res = await requestJson<{
      done?: boolean;
      error?: { message: string };
      response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri: string } }[] } };
    }>(`${BASE}/${ctx.taskId}?key=${key}`, { label: "Veo operation status" });

    if (res.error) return { status: "failed", error: res.error.message };
    if (!res.done) return { status: "running" };

    const samples = res.response?.generateVideoResponse?.generatedSamples ?? [];
    const outputs = samples
      .map((s) => s.video?.uri)
      .filter((uri): uri is string => Boolean(uri))
      .map((uri, i) => ({
        kind: "VIDEO" as const,
        mimeType: "video/mp4",
        name: `veo-${i + 1}.mp4`,
        // the file endpoint needs the API key too
        url: uri.includes("?") ? `${uri}&key=${key}` : `${uri}?key=${key}`,
      }));
    if (!outputs.length) return { status: "failed", error: "Veo finished without returning a video" };
    return { status: "succeeded", outputs };
  },
};
