import crypto from "node:crypto";
import type { ModelSpec, PollContext, PollResult, ProviderAdapter, ProviderOutput, SubmitContext } from "./types";

/**
 * A fully offline provider. It implements every capability with generated
 * placeholder media so the queue, the gallery and the flow engine can be run and
 * tested end to end without a single API key or a cent of spend.
 *
 * Images and video are SVG (video is animated — a real clip needs a real vendor),
 * audio is a synthesised WAV tone.
 */

const PALETTES = [
  ["#6366f1", "#ec4899"],
  ["#06b6d4", "#3b82f6"],
  ["#f59e0b", "#ef4444"],
  ["#10b981", "#14b8a6"],
  ["#8b5cf6", "#f43f5e"],
];

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function wrap(text: string, perLine = 34, maxLines = 5): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > perLine) {
      lines.push(line.trim());
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trim());
  return lines.length ? lines : ["(no prompt)"];
}

function svgImage(prompt: string, label: string, animated: boolean): Buffer {
  const [a, b] = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  const lines = wrap(prompt);
  const text = lines
    .map((line, i) => `<text x="60" y="${300 + i * 52}" class="p">${escapeXml(line)}</text>`)
    .join("");
  const animation = animated
    ? `<animateTransform attributeName="transform" type="rotate" from="0 480 270" to="360 480 270" dur="9s" repeatCount="indefinite"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/>
  </linearGradient></defs>
  <style>
    .p{font:500 34px ui-sans-serif,system-ui,sans-serif;fill:#fff}
    .l{font:600 20px ui-monospace,monospace;fill:rgba(255,255,255,.75);letter-spacing:.18em}
    .m{font:400 18px ui-sans-serif,system-ui,sans-serif;fill:rgba(255,255,255,.6)}
  </style>
  <rect width="960" height="540" fill="url(#g)"/>
  <g opacity=".25"><circle cx="820" cy="120" r="170" fill="#fff">${animation}</circle></g>
  <text x="60" y="90" class="l">${escapeXml(label.toUpperCase())}</text>
  ${text}
  <text x="60" y="500" class="m">mock provider — no vendor was called</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}

/** A short WAV so audio outputs are real, playable files. */
function wavTone(seconds: number, baseHz = 196): Buffer {
  const rate = 22_050;
  const samples = Math.max(1, Math.floor(rate * seconds));
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    // a wobbling triad so it sounds like "speech happening" rather than a flat beep
    const env = Math.min(1, t * 4) * Math.min(1, (seconds - t) * 4) * (0.6 + 0.4 * Math.sin(t * 7));
    const value =
      Math.sin(2 * Math.PI * baseHz * t) * 0.5 +
      Math.sin(2 * Math.PI * baseHz * 1.5 * t) * 0.3 +
      Math.sin(2 * Math.PI * baseHz * 2 * t) * 0.2;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(value * env * 12000))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const promptField = { key: "prompt", label: "Prompt", type: "textarea" as const, required: true, placeholder: "Describe what you want…" };
const durationField = {
  key: "duration",
  label: "Duration",
  type: "select" as const,
  default: "5",
  options: [
    { value: "5", label: "5 seconds" },
    { value: "10", label: "10 seconds" },
  ],
};

function model(id: string, label: string, capability: ModelSpec["capability"], fields: ModelSpec["fields"]): ModelSpec {
  return { id, label, capability, description: "Offline placeholder output.", fields };
}

const models: ModelSpec[] = [
  model("mock-image", "Mock image", "image.generate", [
    promptField,
    {
      key: "aspect_ratio",
      label: "Aspect ratio",
      type: "select",
      default: "16:9",
      options: ["16:9", "1:1", "9:16", "4:3"].map((v) => ({ value: v, label: v })),
    },
  ]),
  model("mock-image-edit", "Mock image edit", "image.edit", [
    { key: "image", label: "Source image", type: "image", required: true },
    promptField,
  ]),
  model("mock-t2v", "Mock text to video", "video.text2video", [promptField, durationField]),
  model("mock-i2v", "Mock image to video", "video.image2video", [
    { key: "image", label: "Start frame", type: "image", required: true },
    promptField,
    durationField,
  ]),
  model("mock-flf2v", "Mock start + end frame", "video.startEndFrame", [
    { key: "image", label: "Start frame", type: "image", required: true },
    { key: "image_tail", label: "End frame", type: "image", required: true },
    promptField,
    durationField,
  ]),
  model("mock-extend", "Mock extend video", "video.extend", [
    { key: "video", label: "Video", type: "video", required: true },
    promptField,
  ]),
  model("mock-lipsync", "Mock lip sync", "video.lipsync", [
    { key: "video", label: "Video", type: "video", required: true },
    { key: "audio", label: "Audio track", type: "audio", required: true },
  ]),
  model("mock-tts", "Mock voice over", "audio.tts", [
    { key: "text", label: "Script", type: "textarea", required: true },
    { key: "voice_id", label: "Voice", type: "voice" },
  ]),
  model("mock-voice-clone", "Mock voice clone", "audio.voiceClone", [
    { key: "name", label: "Voice name", type: "text", required: true },
    { key: "audio", label: "Voice sample (mp3)", type: "audio", required: true },
  ]),
  model("mock-dub", "Mock dubbing", "audio.dub", [
    { key: "audio", label: "Source media", type: "audio", required: true },
    { key: "target_lang", label: "Target language", type: "text", default: "es", required: true },
  ]),
];

function outputsFor(ctx: { model: ModelSpec; params: Record<string, unknown> }): ProviderOutput[] {
  const prompt = String(ctx.params.prompt ?? ctx.params.text ?? ctx.params.name ?? ctx.model.label);
  switch (ctx.model.capability) {
    case "image.generate":
    case "image.edit":
      return [{ kind: "IMAGE", mimeType: "image/svg+xml", name: "mock-image.svg", data: svgImage(prompt, ctx.model.label, false) }];
    case "audio.tts":
    case "audio.dub":
      return [
        {
          kind: "AUDIO",
          mimeType: "audio/wav",
          name: "mock-audio.wav",
          data: wavTone(Math.min(12, Math.max(2, prompt.length / 14))),
        },
      ];
    case "audio.voiceClone":
      return [
        {
          kind: "AUDIO",
          mimeType: "audio/wav",
          name: "mock-voice-preview.wav",
          data: wavTone(3, 240),
          voice: { providerVoiceId: `mock-voice-${crypto.randomUUID().slice(0, 8)}`, name: String(ctx.params.name ?? "Mock voice") },
        },
      ];
    default:
      return [{ kind: "VIDEO", mimeType: "image/svg+xml", name: "mock-video.svg", data: svgImage(prompt, ctx.model.label, true) }];
  }
}

/** Pretend generations take a few seconds so progress UI is exercised. */
const MOCK_DURATION_MS = 6_000;

export const mockProvider: ProviderAdapter = {
  id: "mock",
  label: "Mock (offline)",
  website: "https://example.com",
  docs: "",
  models,
  async submit(ctx: SubmitContext) {
    ctx.log(`mock: pretending to generate ${ctx.model.capability}`);
    return { kind: "async", taskId: `mock_${crypto.randomUUID()}`, meta: { startedAt: Date.now() } };
  },
  async poll(ctx: PollContext): Promise<PollResult> {
    const startedAt = Number(ctx.meta.startedAt ?? Date.now());
    const elapsed = Date.now() - startedAt;
    if (elapsed < MOCK_DURATION_MS) {
      return { status: "running", progress: Math.min(95, Math.round((elapsed / MOCK_DURATION_MS) * 100)) };
    }
    return { status: "succeeded", outputs: outputsFor(ctx) };
  },
};
