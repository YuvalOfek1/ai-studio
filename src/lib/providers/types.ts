/**
 * The contract every vendor adapter implements.
 *
 * The UI and the flow engine only ever speak in *capabilities* — "make me a video
 * from a start and an end frame". The registry maps a capability to the models that
 * can serve it, and the adapter below is the only place that knows a vendor's HTTP.
 */

export type Capability =
  | "image.generate"
  | "image.edit"
  | "video.text2video"
  | "video.image2video"
  | "video.startEndFrame"
  | "video.extend"
  | "video.lipsync"
  | "audio.tts"
  | "audio.voiceClone"
  | "audio.dub";

export type AssetKind = "IMAGE" | "VIDEO" | "AUDIO";

export interface CapabilityInfo {
  id: Capability;
  label: string;
  description: string;
  output: AssetKind;
  icon: string;
}

export const CAPABILITIES: CapabilityInfo[] = [
  { id: "image.generate", label: "Create image", description: "Text prompt to still image.", output: "IMAGE", icon: "image" },
  { id: "image.edit", label: "Edit image", description: "Change an existing image with a prompt.", output: "IMAGE", icon: "wand" },
  { id: "video.text2video", label: "Text to video", description: "Prompt straight to a video clip.", output: "VIDEO", icon: "film" },
  { id: "video.image2video", label: "Image to video", description: "Animate a single image.", output: "VIDEO", icon: "play" },
  { id: "video.startEndFrame", label: "Start + end frame", description: "Interpolate a clip between two frames.", output: "VIDEO", icon: "arrows" },
  { id: "video.extend", label: "Extend video", description: "Continue an existing clip.", output: "VIDEO", icon: "forward" },
  { id: "video.lipsync", label: "Lip sync", description: "Match a face in a video to an audio track.", output: "VIDEO", icon: "mic" },
  { id: "audio.tts", label: "Voice over", description: "Text to speech in a chosen or cloned voice.", output: "AUDIO", icon: "speaker" },
  { id: "audio.voiceClone", label: "Clone voice", description: "Turn an mp3 sample into a reusable voice.", output: "AUDIO", icon: "user" },
  { id: "audio.dub", label: "Dub media", description: "Translate and re-voice an existing clip.", output: "AUDIO", icon: "globe" },
];

export const CAPABILITY_BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "image"
  | "video"
  | "audio"
  | "voice";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
}

export interface ModelSpec {
  id: string;
  label: string;
  capability: Capability;
  description?: string;
  /** Human readable list price, shown in the UI so cost is never a surprise. */
  price?: string;
  fields: Field[];
}

/** A media file resolved from an asset and handed to an adapter. */
export interface MediaInput {
  buffer: Buffer;
  mimeType: string;
  base64: string;
  dataUri: string;
  fileName: string;
}

export interface ProviderCredential {
  secret: string;
  meta: Record<string, string>;
}

export interface SubmitContext {
  jobId: string;
  model: ModelSpec;
  params: Record<string, unknown>;
  /** Media params (fields of type image/video/audio), already downloaded. */
  media: Record<string, MediaInput>;
  credential: ProviderCredential;
  log: (message: string) => void;
}

export interface ProviderOutput {
  kind: AssetKind;
  mimeType: string;
  name?: string;
  /** Either a URL to download, or the bytes themselves. */
  url?: string;
  data?: Buffer;
  meta?: Record<string, unknown>;
  /** Set by adapters that register something other than a file (e.g. a cloned voice). */
  voice?: { providerVoiceId: string; name: string };
}

export type SubmitResult =
  | { kind: "async"; taskId: string; meta?: Record<string, unknown> }
  | { kind: "done"; outputs: ProviderOutput[] };

export type PollResult =
  | { status: "running"; progress?: number; message?: string }
  | { status: "succeeded"; outputs: ProviderOutput[] }
  | { status: "failed"; error: string };

export interface PollContext {
  taskId: string;
  meta: Record<string, unknown>;
  model: ModelSpec;
  params: Record<string, unknown>;
  credential: ProviderCredential;
  log: (message: string) => void;
}

export interface CredentialSpec {
  /** Extra fields some vendors need alongside the key (e.g. MiniMax group id). */
  label: string;
  help: string;
  envVar: string;
  extraEnv?: { key: string; envVar: string; label: string }[];
}

export interface ProviderAdapter {
  id: string;
  label: string;
  website: string;
  docs: string;
  /** Adapters without a credential spec (the mock) need no key. */
  credential?: CredentialSpec;
  models: ModelSpec[];
  submit(ctx: SubmitContext): Promise<SubmitResult>;
  poll?(ctx: PollContext): Promise<PollResult>;
  /** Optional: list voices/models that only exist in the user's vendor account. */
  listVoices?(credential: ProviderCredential): Promise<{ id: string; name: string; description?: string }[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
