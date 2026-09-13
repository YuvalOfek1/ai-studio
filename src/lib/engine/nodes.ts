import type { Capability, ModelSpec } from "../providers/types";

/**
 * Node/port model shared by the canvas (client) and the graph runner (server).
 * This file must stay free of server-only imports so the browser can use it.
 */

export type PortType = "text" | "image" | "video" | "audio" | "voice";

export interface Port {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
}

export type NodeKind = "text" | "asset" | "voice" | "generate" | "output";

export interface FlowNodeData {
  kind: NodeKind;
  label?: string;
  /** text node */
  text?: string;
  /** asset node */
  assetId?: string;
  assetKind?: "IMAGE" | "VIDEO" | "AUDIO";
  /** voice node */
  voiceId?: string;
  voiceName?: string;
  /** generate node */
  capability?: Capability;
  providerId?: string;
  modelId?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export const PORT_COLORS: Record<PortType, string> = {
  text: "#64748b",
  image: "#6366f1",
  video: "#ec4899",
  audio: "#10b981",
  voice: "#f59e0b",
};

/** Fields that are wired rather than typed in, plus the ones that can be either. */
const TEXT_PORT_KEYS = new Set(["prompt", "text", "promptText", "negative_prompt"]);

export function portsForModel(model: ModelSpec): { inputs: Port[]; outputs: Port[] } {
  const inputs: Port[] = [];
  for (const field of model.fields) {
    if (field.type === "image" || field.type === "video" || field.type === "audio") {
      inputs.push({ id: field.key, label: field.label, type: field.type, required: field.required });
    } else if (field.type === "voice") {
      inputs.push({ id: field.key, label: field.label, type: "voice", required: field.required });
    } else if (TEXT_PORT_KEYS.has(field.key)) {
      inputs.push({ id: field.key, label: field.label, type: "text", required: field.required });
    }
  }
  return { inputs, outputs: [{ id: "output", label: "Result", type: outputPortType(model.capability) }] };
}

export function outputPortType(capability: Capability): PortType {
  if (capability.startsWith("image")) return "image";
  if (capability.startsWith("video")) return "video";
  if (capability === "audio.voiceClone") return "voice";
  return "audio";
}

export interface SourceNodeSpec {
  kind: NodeKind;
  label: string;
  description: string;
  outputs: Port[];
  inputs: Port[];
}

export const SOURCE_NODES: SourceNodeSpec[] = [
  {
    kind: "text",
    label: "Text",
    description: "A prompt or script you can fan out to several nodes.",
    inputs: [],
    outputs: [{ id: "output", label: "Text", type: "text" }],
  },
  {
    kind: "asset",
    label: "Asset",
    description: "An image, video or audio file already in the project.",
    inputs: [],
    outputs: [{ id: "output", label: "Asset", type: "image" }],
  },
  {
    kind: "voice",
    label: "Voice",
    description: "A voice from your provider account, including cloned ones.",
    inputs: [],
    outputs: [{ id: "output", label: "Voice", type: "voice" }],
  },
  {
    kind: "output",
    label: "Output",
    description: "Marks a result as a deliverable of this workflow.",
    inputs: [{ id: "input", label: "Result", type: "image" }],
    outputs: [],
  },
];

export interface FlowGraph {
  nodes: { id: string; type?: string; position: { x: number; y: number }; data: FlowNodeData }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[];
}

export const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };

/** Kahn's algorithm; throws when the graph has a cycle. */
export function topologicalOrder(graph: FlowGraph): string[] {
  const indegree = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));

  for (const edge of graph.edges) {
    if (!indegree.has(edge.target) || !indegree.has(edge.source)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }

  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  if (order.length !== graph.nodes.length) {
    throw new Error("This workflow has a cycle — every connection must flow forward.");
  }
  return order;
}
