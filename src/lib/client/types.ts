import type { Capability, Field, ModelSpec } from "@/lib/providers/types";
import type { ModelRate } from "@/lib/pricing/rates";

export interface ModelOption extends ModelSpec {
  providerId: string;
  providerLabel: string;
  needsKey: boolean;
}

export interface CapabilityGroup {
  id: Capability;
  label: string;
  description: string;
  output: "IMAGE" | "VIDEO" | "AUDIO";
  icon: string;
  models: ModelOption[];
}

export interface Catalog {
  capabilities: CapabilityGroup[];
  providers: {
    id: string;
    label: string;
    website: string;
    docs: string;
    credential: { label: string; help: string; envVar: string; extraEnv?: { key: string; envVar: string; label: string }[] } | null;
    modelCount: number;
    capabilities: Capability[];
  }[];
  configured: string[];
  rates: Record<string, ModelRate>;
}

export interface Asset {
  id: string;
  projectId: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO";
  name: string;
  url: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  sizeBytes: number;
  source: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface Job {
  costAmount?: number | null;
  costCurrency?: string;
  costEstimated?: boolean;
  id: string;
  projectId: string;
  capability: Capability;
  providerId: string;
  modelId: string;
  label?: string | null;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress: number;
  error?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  params: Record<string, unknown>;
  assets: Asset[];
  nodeId?: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  error?: string | null;
  createdAt: string;
  jobs: { id: string; nodeId: string | null; status: Job["status"]; error?: string | null }[];
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number; jobs: number; workflows: number };
  cover?: { storageKey: string; mimeType: string; kind: string } | null;
}

export interface Voice {
  id: string;
  name: string;
  providerId: string;
  providerVoiceId: string;
  description?: string | null;
  sampleUrl?: string | null;
}

export interface Workflow {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  graph: { nodes: unknown[]; edges: unknown[] };
  updatedAt: string;
  _count?: { runs: number };
}

export type { Field, Capability };
