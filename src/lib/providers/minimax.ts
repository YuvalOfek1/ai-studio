import { requestJson, jsonHeaders } from "./http";
import {
  ProviderError,
  type Field,
  type ModelSpec,
  type PollContext,
  type PollResult,
  type ProviderAdapter,
  type SubmitContext,
} from "./types";

/**
 * MiniMax (Hailuo) video — direct API. Submit returns a task id; when the task
 * succeeds you exchange its file id for a download URL.
 * Docs: https://platform.minimax.io/docs/api-reference/video-generation-t2v
 */

const BASE = () => (process.env.MINIMAX_BASE_URL?.replace(/\/$/, "") || "https://api.minimax.io") + "/v1";

const VIDEO_MODELS = [
  { value: "MiniMax-Hailuo-02", label: "Hailuo 02 (best)" },
  { value: "T2V-01-Director", label: "T2V-01 Director (camera control)" },
  { value: "I2V-01-Director", label: "I2V-01 Director" },
  { value: "I2V-01-live", label: "I2V-01 Live (illustration)" },
];

const prompt: Field = { key: "prompt", label: "Prompt", type: "textarea", required: true };
const duration: Field = {
  key: "duration",
  label: "Duration",
  type: "select",
  default: "6",
  options: [
    { value: "6", label: "6 seconds" },
    { value: "10", label: "10 seconds" },
  ],
};
const resolution: Field = {
  key: "resolution",
  label: "Resolution",
  type: "select",
  default: "768P",
  options: ["512P", "768P", "1080P"].map((v) => ({ value: v, label: v })),
};

const models: ModelSpec[] = [
  {
    id: "minimax-t2v",
    label: "Hailuo text to video",
    capability: "video.text2video",
    fields: [
      { key: "model", label: "Model", type: "select", default: VIDEO_MODELS[0].value, options: VIDEO_MODELS },
      prompt,
      duration,
      resolution,
      { key: "prompt_optimizer", label: "Prompt optimiser", type: "boolean", default: true },
    ],
  },
  {
    id: "minimax-i2v",
    label: "Hailuo image to video",
    capability: "video.image2video",
    fields: [
      { key: "model", label: "Model", type: "select", default: VIDEO_MODELS[0].value, options: VIDEO_MODELS },
      { key: "image", label: "Start frame", type: "image", required: true },
      prompt,
      duration,
      resolution,
    ],
  },
  {
    id: "minimax-flf2v",
    label: "Hailuo start + end frame",
    capability: "video.startEndFrame",
    fields: [
      { key: "model", label: "Model", type: "select", default: "MiniMax-Hailuo-02", options: VIDEO_MODELS },
      { key: "image", label: "Start frame", type: "image", required: true },
      {
        key: "image_tail",
        label: "End frame",
        type: "image",
        help: "Optional — leave empty to animate from the start frame alone.",
      },
      prompt,
      duration,
      resolution,
    ],
  },
];

interface BaseResp {
  base_resp?: { status_code: number; status_msg: string };
}

function assertOk(res: BaseResp, label: string) {
  if (res.base_resp && res.base_resp.status_code !== 0) {
    throw new ProviderError(`${label}: ${res.base_resp.status_msg} (code ${res.base_resp.status_code})`);
  }
}

export const miniMaxProvider: ProviderAdapter = {
  id: "minimax",
  label: "MiniMax (Hailuo)",
  website: "https://platform.minimax.io",
  docs: "https://platform.minimax.io/docs/api-reference/video-generation-t2v",
  credential: {
    label: "API key",
    help: "MiniMax console → API keys. The group id is needed to download finished files.",
    envVar: "MINIMAX_API_KEY",
    extraEnv: [{ key: "groupId", envVar: "MINIMAX_GROUP_ID", label: "Group ID" }],
  },
  models,

  async submit(ctx: SubmitContext) {
    const body: Record<string, unknown> = {
      model: ctx.params.model ?? "MiniMax-Hailuo-02",
      prompt: ctx.params.prompt,
      duration: Number(ctx.params.duration ?? 6),
      resolution: ctx.params.resolution ?? "768P",
    };
    if (ctx.params.prompt_optimizer !== undefined) body.prompt_optimizer = Boolean(ctx.params.prompt_optimizer);
    if (ctx.media.image) body.first_frame_image = ctx.media.image.dataUri;
    if (ctx.media.image_tail) body.last_frame_image = ctx.media.image_tail.dataUri;

    ctx.log("minimax: POST /video_generation");
    const res = await requestJson<BaseResp & { task_id: string }>(`${BASE()}/video_generation`, {
      method: "POST",
      label: "MiniMax video generation",
      headers: jsonHeaders({ authorization: `Bearer ${ctx.credential.secret}` }),
      body: JSON.stringify(body),
    });
    assertOk(res, "MiniMax submit");
    if (!res.task_id) throw new ProviderError("MiniMax returned no task id");
    return { kind: "async", taskId: res.task_id };
  },

  async poll(ctx: PollContext): Promise<PollResult> {
    const auth = { authorization: `Bearer ${ctx.credential.secret}` };
    const res = await requestJson<BaseResp & { status: string; file_id?: string }>(
      `${BASE()}/query/video_generation?task_id=${encodeURIComponent(ctx.taskId)}`,
      { label: "MiniMax status", headers: auth },
    );
    assertOk(res, "MiniMax poll");
    if (res.status === "Fail") return { status: "failed", error: "MiniMax reported the generation failed" };
    if (res.status !== "Success") return { status: "running", message: res.status };
    if (!res.file_id) return { status: "failed", error: "MiniMax reported success without a file id" };

    const groupId = ctx.credential.meta.groupId;
    const query = new URLSearchParams({ file_id: res.file_id });
    if (groupId) query.set("GroupId", groupId);
    const file = await requestJson<BaseResp & { file: { download_url: string } }>(
      `${BASE()}/files/retrieve?${query.toString()}`,
      { label: "MiniMax file retrieve", headers: auth },
    );
    assertOk(file, "MiniMax file retrieve");
    return {
      status: "succeeded",
      outputs: [{ kind: "VIDEO", mimeType: "video/mp4", name: `hailuo-${res.file_id}.mp4`, url: file.file.download_url }],
    };
  },
};
