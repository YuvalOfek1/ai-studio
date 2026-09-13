import { bflProvider } from "./bfl";
import { elevenLabsProvider } from "./elevenlabs";
import { googleProvider } from "./google";
import { klingProvider } from "./kling";
import { miniMaxProvider } from "./minimax";
import { mockProvider } from "./mock";
import { openAiProvider } from "./openai";
import { runwayProvider } from "./runway";
import { CAPABILITIES, type Capability, type ModelSpec, type ProviderAdapter } from "./types";

/**
 * Every vendor the studio can call. Adding one is: write the adapter file, add it
 * here. The UI, the queue and the flow engine pick it up automatically.
 */
export const PROVIDERS: ProviderAdapter[] = [
  klingProvider,
  elevenLabsProvider,
  openAiProvider,
  googleProvider,
  miniMaxProvider,
  runwayProvider,
  bflProvider,
  mockProvider,
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): ProviderAdapter {
  const provider = PROVIDER_BY_ID.get(id);
  if (!provider) throw new Error(`Unknown provider "${id}"`);
  return provider;
}

export function getModel(providerId: string, modelId: string): ModelSpec {
  const model = getProvider(providerId).models.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model "${modelId}" for provider "${providerId}"`);
  return model;
}

export interface ModelOption extends ModelSpec {
  providerId: string;
  providerLabel: string;
  needsKey: boolean;
}

export function modelsForCapability(capability: Capability): ModelOption[] {
  return PROVIDERS.flatMap((provider) =>
    provider.models
      .filter((model) => model.capability === capability)
      .map((model) => ({
        ...model,
        providerId: provider.id,
        providerLabel: provider.label,
        needsKey: Boolean(provider.credential),
      })),
  );
}

/** The shape the UI consumes to render the workstation and the node inspector. */
export function catalog() {
  return {
    capabilities: CAPABILITIES.map((capability) => ({
      ...capability,
      models: modelsForCapability(capability.id),
    })),
    providers: PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      website: p.website,
      docs: p.docs,
      credential: p.credential ?? null,
      modelCount: p.models.length,
      capabilities: [...new Set(p.models.map((m) => m.capability))],
    })),
  };
}
