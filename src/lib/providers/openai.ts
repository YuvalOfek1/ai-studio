import { requestJson, jsonHeaders } from "./http";
import { ProviderError, type ModelSpec, type ProviderAdapter, type SubmitContext } from "./types";

/**
 * OpenAI images — direct API (gpt-image-1). Synchronous: the response carries
 * base64 image data, so there is nothing to poll.
 * Docs: https://platform.openai.com/docs/api-reference/images
 */

const BASE = "https://api.openai.com/v1";

const SIZES = [
  { value: "1024x1024", label: "Square 1024" },
  { value: "1536x1024", label: "Landscape 1536×1024" },
  { value: "1024x1536", label: "Portrait 1024×1536" },
  { value: "auto", label: "Auto" },
];

const QUALITY = ["low", "medium", "high", "auto"].map((v) => ({ value: v, label: v }));

interface ImageResponse {
  data: { b64_json?: string; url?: string; revised_prompt?: string }[];
}

const models: ModelSpec[] = [
  {
    id: "gpt-image-1",
    label: "GPT Image 1",
    capability: "image.generate",
    description: "Strong prompt following and readable text inside images.",
    price: "per image, by size and quality",
    fields: [
      { key: "prompt", label: "Prompt", type: "textarea", required: true },
      { key: "size", label: "Size", type: "select", default: "1024x1024", options: SIZES },
      { key: "quality", label: "Quality", type: "select", default: "medium", options: QUALITY },
      { key: "n", label: "Number of images", type: "number", default: 1, min: 1, max: 4, step: 1 },
      {
        key: "background",
        label: "Background",
        type: "select",
        default: "auto",
        options: ["auto", "transparent", "opaque"].map((v) => ({ value: v, label: v })),
      },
    ],
  },
  {
    id: "gpt-image-1-edit",
    label: "GPT Image 1 — edit",
    capability: "image.edit",
    description: "Rewrite part or all of an existing image from a prompt.",
    fields: [
      { key: "image", label: "Source image", type: "image", required: true },
      { key: "prompt", label: "What should change?", type: "textarea", required: true },
      { key: "size", label: "Size", type: "select", default: "1024x1024", options: SIZES },
    ],
  },
];

export const openAiProvider: ProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  website: "https://platform.openai.com",
  docs: "https://platform.openai.com/docs/api-reference/images",
  credential: { label: "API key", help: "Starts with sk-. From platform.openai.com → API keys.", envVar: "OPENAI_API_KEY" },
  models,

  async submit(ctx: SubmitContext) {
    const auth = { authorization: `Bearer ${ctx.credential.secret}` };
    let res: ImageResponse;

    if (ctx.model.capability === "image.edit") {
      const image = ctx.media.image;
      const form = new FormData();
      form.append("model", "gpt-image-1");
      form.append("prompt", String(ctx.params.prompt));
      form.append("size", String(ctx.params.size ?? "1024x1024"));
      form.append("image", new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }), image.fileName);
      ctx.log("openai: POST /images/edits");
      res = await requestJson<ImageResponse>(`${BASE}/images/edits`, {
        method: "POST",
        label: "OpenAI image edit",
        headers: auth,
        body: form,
      });
    } else {
      ctx.log("openai: POST /images/generations");
      res = await requestJson<ImageResponse>(`${BASE}/images/generations`, {
        method: "POST",
        label: "OpenAI image generation",
        headers: jsonHeaders(auth),
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: ctx.params.prompt,
          size: ctx.params.size ?? "1024x1024",
          quality: ctx.params.quality ?? "medium",
          n: Number(ctx.params.n ?? 1),
          background: ctx.params.background === "auto" ? undefined : ctx.params.background,
        }),
      });
    }

    const outputs = res.data.map((item, index) => {
      if (item.b64_json) {
        return {
          kind: "IMAGE" as const,
          mimeType: "image/png",
          name: `openai-${index + 1}.png`,
          data: Buffer.from(item.b64_json, "base64"),
          meta: item.revised_prompt ? { revisedPrompt: item.revised_prompt } : undefined,
        };
      }
      return { kind: "IMAGE" as const, mimeType: "image/png", name: `openai-${index + 1}.png`, url: item.url! };
    });
    if (!outputs.length) throw new ProviderError("OpenAI returned no images");
    return { kind: "done", outputs };
  },
};
