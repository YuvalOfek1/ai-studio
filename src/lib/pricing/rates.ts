/**
 * What each model costs, per unit, in USD.
 *
 * These are **defaults, not gospel**: vendor list prices change, and your own
 * contract or plan tier may differ. Every rate here can be overridden from the
 * Spend page (stored in the PricingRate table) without touching code — and
 * anything you override can be applied retroactively to past jobs.
 *
 * `unit` decides what gets counted:
 *   call      → 1 per generation
 *   image     → number of images asked for
 *   second    → clip length in seconds
 *   minute    → length of the source media in minutes (dubbing)
 *   character → length of the script (text to speech)
 *
 * `modifiers` multiply the rate when a parameter matches, so one entry covers a
 * model's quality/resolution tiers.
 */

export type RateUnit = "call" | "image" | "second" | "minute" | "character";

export interface ModelRate {
  unit: RateUnit;
  /** USD per unit. */
  amount: number;
  /** e.g. { quality: { high: 2.7 } } multiplies the rate when params.quality === "high". */
  modifiers?: Record<string, Record<string, number>>;
  note?: string;
}

/** Keyed "providerId:modelId". */
export const DEFAULT_RATES: Record<string, ModelRate> = {
  // ---- images ----
  "openai:gpt-image-1": {
    unit: "image",
    amount: 0.07,
    modifiers: { quality: { low: 0.29, medium: 1, high: 2.71, auto: 1 } },
    note: "medium 1024², scaled for low/high quality",
  },
  "openai:gpt-image-1-edit": { unit: "image", amount: 0.07 },
  "bfl:flux-generate": {
    unit: "image",
    amount: 0.04,
    modifiers: { endpoint: { "flux-pro-1.1": 1, "flux-pro-1.1-ultra": 1.5, "flux-dev": 0.63 } },
  },
  "bfl:flux-kontext": { unit: "image", amount: 0.04 },
  "google:imagen-4": {
    unit: "image",
    amount: 0.04,
    modifiers: {
      model: { "imagen-4.0-generate-001": 1, "imagen-4.0-ultra-generate-001": 1.5, "imagen-4.0-fast-generate-001": 0.5 },
    },
  },
  "kling:kling-image": { unit: "image", amount: 0.03 },

  // ---- video (priced by clip length) ----
  "google:veo-text2video": {
    unit: "second",
    amount: 0.4,
    modifiers: {
      model: { "veo-3.0-generate-001": 1, "veo-3.0-fast-generate-001": 0.38, "veo-2.0-generate-001": 0.88 },
    },
    note: "Veo 3 with audio",
  },
  "google:veo-image2video": {
    unit: "second",
    amount: 0.4,
    modifiers: {
      model: { "veo-3.0-generate-001": 1, "veo-3.0-fast-generate-001": 0.38, "veo-2.0-generate-001": 0.88 },
    },
  },
  "minimax:minimax-t2v": {
    unit: "second",
    amount: 0.07,
    modifiers: { resolution: { "512P": 0.6, "768P": 1, "1080P": 2 } },
  },
  "minimax:minimax-i2v": {
    unit: "second",
    amount: 0.07,
    modifiers: { resolution: { "512P": 0.6, "768P": 1, "1080P": 2 } },
  },
  "minimax:minimax-flf2v": {
    unit: "second",
    amount: 0.07,
    modifiers: { resolution: { "512P": 0.6, "768P": 1, "1080P": 2 } },
  },
  "runway:runway-i2v": { unit: "second", amount: 0.05, modifiers: { model: { gen4_turbo: 1, gen3a_turbo: 1 } } },
  "runway:runway-startend": { unit: "second", amount: 0.05 },
  "kling:kling-text2video": { unit: "second", amount: 0.056, modifiers: { mode: { std: 1, pro: 1.75 } } },
  "kling:kling-image2video": { unit: "second", amount: 0.056, modifiers: { mode: { std: 1, pro: 1.75 } } },
  "kling:kling-startend": { unit: "second", amount: 0.056, modifiers: { mode: { std: 1, pro: 1.75 } } },
  "kling:kling-lipsync": { unit: "call", amount: 0.15 },

  // ---- audio ----
  "elevenlabs:elevenlabs-tts": {
    unit: "character",
    amount: 0.00015,
    modifiers: { model_id: { eleven_multilingual_v2: 1, eleven_turbo_v2_5: 0.5, eleven_flash_v2_5: 0.5 } },
    note: "≈$0.15 per 1k characters on a Creator plan",
  },
  "elevenlabs:elevenlabs-ivc": { unit: "call", amount: 0, note: "instant cloning is included in the plan" },
  "elevenlabs:elevenlabs-dubbing": { unit: "minute", amount: 1.0, note: "per minute of source media" },

  // ---- the offline provider costs nothing, by definition ----
  "mock:mock-image": { unit: "call", amount: 0 },
  "mock:mock-image-edit": { unit: "call", amount: 0 },
  "mock:mock-t2v": { unit: "call", amount: 0 },
  "mock:mock-i2v": { unit: "call", amount: 0 },
  "mock:mock-flf2v": { unit: "call", amount: 0 },
  "mock:mock-extend": { unit: "call", amount: 0 },
  "mock:mock-lipsync": { unit: "call", amount: 0 },
  "mock:mock-tts": { unit: "call", amount: 0 },
  "mock:mock-voice-clone": { unit: "call", amount: 0 },
  "mock:mock-dub": { unit: "call", amount: 0 },
};

export const rateKey = (providerId: string, modelId: string) => `${providerId}:${modelId}`;

export const UNIT_LABEL: Record<RateUnit, string> = {
  call: "per generation",
  image: "per image",
  second: "per second of video",
  minute: "per minute of media",
  character: "per character",
};
