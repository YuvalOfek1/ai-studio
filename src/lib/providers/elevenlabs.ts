import { requestBinary, requestJson, jsonHeaders } from "./http";
import {
  ProviderError,
  type ModelSpec,
  type PollContext,
  type PollResult,
  type ProviderAdapter,
  type ProviderCredential,
  type SubmitContext,
} from "./types";

/**
 * ElevenLabs — direct API for voice over, instant voice cloning and dubbing.
 *
 * Auth: `xi-api-key` header. TTS and cloning are synchronous; dubbing is a job
 * you poll and then download per target language.
 * Docs: https://elevenlabs.io/docs/api-reference
 */

const BASE = "https://api.elevenlabs.io";

const headers = (cred: ProviderCredential) => ({ "xi-api-key": cred.secret });

const TTS_MODELS = [
  { value: "eleven_multilingual_v2", label: "Multilingual v2 (best quality)" },
  { value: "eleven_turbo_v2_5", label: "Turbo v2.5 (cheaper, faster)" },
  { value: "eleven_flash_v2_5", label: "Flash v2.5 (lowest latency)" },
];

const LANGUAGES = [
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["pl", "Polish"],
  ["hi", "Hindi"],
  ["ar", "Arabic"],
  ["he", "Hebrew"],
  ["ru", "Russian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
].map(([value, label]) => ({ value, label }));

const models: ModelSpec[] = [
  {
    id: "elevenlabs-tts",
    label: "ElevenLabs voice over",
    capability: "audio.tts",
    description: "Read a script in any voice in your account, including voices you cloned from an mp3.",
    fields: [
      { key: "text", label: "Script", type: "textarea", required: true, placeholder: "What should the voice say?" },
      { key: "voice_id", label: "Voice", type: "voice", required: true },
      { key: "model_id", label: "Model", type: "select", default: TTS_MODELS[0].value, options: TTS_MODELS },
      { key: "stability", label: "Stability", type: "number", default: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "similarity_boost", label: "Similarity", type: "number", default: 0.75, min: 0, max: 1, step: 0.05 },
      { key: "style", label: "Style exaggeration", type: "number", default: 0, min: 0, max: 1, step: 0.05 },
      { key: "speed", label: "Speed", type: "number", default: 1, min: 0.7, max: 1.2, step: 0.05 },
    ],
  },
  {
    id: "elevenlabs-ivc",
    label: "ElevenLabs instant voice clone",
    capability: "audio.voiceClone",
    description: "Upload an mp3 of a voice; it becomes selectable for every voice over.",
    fields: [
      { key: "name", label: "Voice name", type: "text", required: true, placeholder: "Narrator — Yuval" },
      { key: "audio", label: "Voice sample", type: "audio", required: true, help: "30s–3min of clean speech works best." },
      { key: "description", label: "Description", type: "text" },
    ],
  },
  {
    id: "elevenlabs-dubbing",
    label: "ElevenLabs dubbing",
    capability: "audio.dub",
    description: "Translate and re-voice an existing audio or video file, keeping the original speaker's voice.",
    fields: [
      { key: "audio", label: "Source media", type: "audio", required: true },
      { key: "target_lang", label: "Target language", type: "select", required: true, default: "es", options: LANGUAGES },
      { key: "source_lang", label: "Source language", type: "select", default: "auto", options: [{ value: "auto", label: "Detect" }, ...LANGUAGES] },
      { key: "num_speakers", label: "Speakers", type: "number", default: 0, min: 0, max: 10, step: 1, help: "0 = detect automatically." },
      { key: "watermark", label: "Watermark", type: "boolean", default: false },
    ],
  },
];

export const elevenLabsProvider: ProviderAdapter = {
  id: "elevenlabs",
  label: "ElevenLabs",
  website: "https://elevenlabs.io",
  docs: "https://elevenlabs.io/docs/api-reference",
  credential: { label: "API key", help: "ElevenLabs → Profile → API key.", envVar: "ELEVENLABS_API_KEY" },
  models,

  async submit(ctx: SubmitContext) {
    switch (ctx.model.capability) {
      case "audio.tts": {
        const voiceId = String(ctx.params.voice_id || "").trim();
        if (!voiceId) throw new ProviderError("Pick a voice first (clone one from an mp3, or sync your account voices).");
        ctx.log(`elevenlabs: text-to-speech with voice ${voiceId}`);
        const { data, mimeType } = await requestBinary(
          `${BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
          {
            method: "POST",
            label: "ElevenLabs text-to-speech",
            headers: jsonHeaders(headers(ctx.credential)),
            body: JSON.stringify({
              text: ctx.params.text,
              model_id: ctx.params.model_id ?? "eleven_multilingual_v2",
              voice_settings: {
                stability: Number(ctx.params.stability ?? 0.5),
                similarity_boost: Number(ctx.params.similarity_boost ?? 0.75),
                style: Number(ctx.params.style ?? 0),
                use_speaker_boost: true,
                speed: Number(ctx.params.speed ?? 1),
              },
            }),
          },
        );
        return {
          kind: "done",
          outputs: [{ kind: "AUDIO", mimeType: mimeType || "audio/mpeg", name: "voice-over.mp3", data }],
        };
      }

      case "audio.voiceClone": {
        const sample = ctx.media.audio;
        const form = new FormData();
        form.append("name", String(ctx.params.name ?? "Cloned voice"));
        if (ctx.params.description) form.append("description", String(ctx.params.description));
        form.append("files", new Blob([new Uint8Array(sample.buffer)], { type: sample.mimeType }), sample.fileName);
        ctx.log("elevenlabs: creating instant voice clone");
        const res = await requestJson<{ voice_id: string }>(`${BASE}/v1/voices/add`, {
          method: "POST",
          label: "ElevenLabs voice clone",
          headers: headers(ctx.credential),
          body: form,
        });
        return {
          kind: "done",
          outputs: [
            {
              kind: "AUDIO",
              mimeType: sample.mimeType,
              name: sample.fileName,
              data: sample.buffer,
              voice: { providerVoiceId: res.voice_id, name: String(ctx.params.name ?? "Cloned voice") },
              meta: { voiceId: res.voice_id },
            },
          ],
        };
      }

      case "audio.dub": {
        const source = ctx.media.audio;
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(source.buffer)], { type: source.mimeType }), source.fileName);
        form.append("target_lang", String(ctx.params.target_lang ?? "es"));
        if (ctx.params.source_lang && ctx.params.source_lang !== "auto") {
          form.append("source_lang", String(ctx.params.source_lang));
        }
        const speakers = Number(ctx.params.num_speakers ?? 0);
        if (speakers > 0) form.append("num_speakers", String(speakers));
        form.append("watermark", String(Boolean(ctx.params.watermark)));
        ctx.log("elevenlabs: submitting dubbing job");
        const res = await requestJson<{ dubbing_id: string; expected_duration_sec?: number }>(`${BASE}/v1/dubbing`, {
          method: "POST",
          label: "ElevenLabs dubbing",
          headers: headers(ctx.credential),
          body: form,
        });
        return { kind: "async", taskId: res.dubbing_id, meta: { targetLang: String(ctx.params.target_lang ?? "es") } };
      }

      default:
        throw new ProviderError(`ElevenLabs does not serve ${ctx.model.capability}`);
    }
  },

  async poll(ctx: PollContext): Promise<PollResult> {
    const status = await requestJson<{ status: string; error_message?: string }>(
      `${BASE}/v1/dubbing/${encodeURIComponent(ctx.taskId)}`,
      { label: "ElevenLabs dubbing status", headers: headers(ctx.credential) },
    );
    if (status.status === "failed") return { status: "failed", error: status.error_message || "Dubbing failed" };
    if (status.status !== "dubbed") return { status: "running", message: status.status };

    const lang = String(ctx.meta.targetLang ?? ctx.params.target_lang ?? "es");
    const { data, mimeType } = await requestBinary(
      `${BASE}/v1/dubbing/${encodeURIComponent(ctx.taskId)}/audio/${encodeURIComponent(lang)}`,
      { label: "ElevenLabs dubbed audio", headers: headers(ctx.credential) },
    );
    const isVideo = mimeType.startsWith("video");
    return {
      status: "succeeded",
      outputs: [
        {
          kind: isVideo ? "VIDEO" : "AUDIO",
          mimeType: mimeType || "audio/mpeg",
          name: `dubbed-${lang}.${isVideo ? "mp4" : "mp3"}`,
          data,
        },
      ],
    };
  },

  async listVoices(credential: ProviderCredential) {
    const res = await requestJson<{ voices: { voice_id: string; name: string; description?: string; category?: string }[] }>(
      `${BASE}/v1/voices`,
      { label: "ElevenLabs voices", headers: headers(credential) },
    );
    return res.voices.map((v) => ({ id: v.voice_id, name: v.name, description: v.description ?? v.category }));
  },
};
