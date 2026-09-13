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
 * Black Forest Labs (FLUX) — direct API, the cheapest good text-to-image of the
 * bunch. Submit returns a polling URL; poll until status is Ready.
 * Docs: https://docs.bfl.ai
 */

const BASE = "https://api.bfl.ai/v1";

const ENDPOINTS = [
  { value: "flux-pro-1.1", label: "FLUX 1.1 Pro" },
  { value: "flux-pro-1.1-ultra", label: "FLUX 1.1 Pro Ultra" },
  { value: "flux-dev", label: "FLUX Dev (cheapest)" },
];

const models: ModelSpec[] = [
  {
    id: "flux-generate",
    label: "FLUX image",
    capability: "image.generate",
    price: "a few cents per image",
    fields: [
      { key: "endpoint", label: "Model", type: "select", default: ENDPOINTS[0].value, options: ENDPOINTS },
      { key: "prompt", label: "Prompt", type: "textarea", required: true },
      { key: "width", label: "Width", type: "number", default: 1024, min: 256, max: 1440, step: 32 },
      { key: "height", label: "Height", type: "number", default: 768, min: 256, max: 1440, step: 32 },
      { key: "prompt_upsampling", label: "Prompt upsampling", type: "boolean", default: false },
      { key: "safety_tolerance", label: "Safety tolerance", type: "number", default: 2, min: 0, max: 6, step: 1 },
    ],
  },
  {
    id: "flux-kontext",
    label: "FLUX Kontext — edit",
    capability: "image.edit",
    description: "Instruction based editing that keeps the rest of the image intact.",
    fields: [
      { key: "image", label: "Source image", type: "image", required: true },
      { key: "prompt", label: "Instruction", type: "textarea", required: true, placeholder: "Make the jacket red" },
    ],
  },
];

export const bflProvider: ProviderAdapter = {
  id: "bfl",
  label: "Black Forest Labs (FLUX)",
  website: "https://bfl.ai",
  docs: "https://docs.bfl.ai",
  credential: { label: "API key", help: "From the BFL dashboard.", envVar: "BFL_API_KEY" },
  models,

  async submit(ctx: SubmitContext) {
    const isEdit = ctx.model.capability === "image.edit";
    const endpoint = isEdit ? "flux-kontext-pro" : String(ctx.params.endpoint ?? "flux-pro-1.1");
    const body: Record<string, unknown> = { prompt: ctx.params.prompt, output_format: "png" };
    if (isEdit) {
      body.input_image = ctx.media.image.base64;
    } else {
      body.width = Number(ctx.params.width ?? 1024);
      body.height = Number(ctx.params.height ?? 768);
      body.prompt_upsampling = Boolean(ctx.params.prompt_upsampling);
      body.safety_tolerance = Number(ctx.params.safety_tolerance ?? 2);
    }
    ctx.log(`bfl: POST /${endpoint}`);
    const res = await requestJson<{ id: string; polling_url?: string }>(`${BASE}/${endpoint}`, {
      method: "POST",
      label: "FLUX submit",
      headers: jsonHeaders({ "x-key": ctx.credential.secret }),
      body: JSON.stringify(body),
    });
    if (!res.id) throw new ProviderError("FLUX returned no request id");
    return { kind: "async", taskId: res.id, meta: { pollingUrl: res.polling_url } };
  },

  async poll(ctx: PollContext): Promise<PollResult> {
    const url = String(ctx.meta.pollingUrl ?? `${BASE}/get_result?id=${encodeURIComponent(ctx.taskId)}`);
    const res = await requestJson<{ status: string; result?: { sample?: string }; details?: unknown }>(url, {
      label: "FLUX poll",
      headers: { "x-key": ctx.credential.secret },
    });
    if (res.status === "Ready") {
      const sample = res.result?.sample;
      if (!sample) return { status: "failed", error: "FLUX reported Ready without an image URL" };
      return { status: "succeeded", outputs: [{ kind: "IMAGE", mimeType: "image/png", name: "flux.png", url: sample }] };
    }
    if (["Error", "Request Moderated", "Content Moderated", "Task not found"].includes(res.status)) {
      return { status: "failed", error: `FLUX: ${res.status}${res.details ? ` — ${JSON.stringify(res.details).slice(0, 200)}` : ""}` };
    }
    return { status: "running", message: res.status };
  },
};
