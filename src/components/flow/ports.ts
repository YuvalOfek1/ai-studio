"use client";

import { outputPortType, portsForModel, type FlowNodeData, type Port } from "@/lib/engine/nodes";
import type { Catalog, ModelOption } from "@/lib/client/types";

/** Port sets are cached on the node so renderers and validation stay cheap. */
export function computePorts(data: FlowNodeData, catalog: Catalog | null): { inputs: Port[]; outputs: Port[] } {
  switch (data.kind) {
    case "text":
      return { inputs: [], outputs: [{ id: "output", label: "Text", type: "text" }] };
    case "asset": {
      const kind = (data.assetKind ?? "IMAGE").toLowerCase() as "image" | "video" | "audio";
      return { inputs: [], outputs: [{ id: "output", label: kind, type: kind }] };
    }
    case "voice":
      return { inputs: [], outputs: [{ id: "output", label: "Voice", type: "voice" }] };
    case "output":
      return { inputs: [{ id: "input", label: "Result", type: "image" }], outputs: [] };
    case "generate": {
      const model = findModel(catalog, data.providerId, data.modelId);
      if (!model) return { inputs: [], outputs: [{ id: "output", label: "Result", type: "image" }] };
      return portsForModel(model);
    }
    default:
      return { inputs: [], outputs: [] };
  }
}

export function findModel(catalog: Catalog | null, providerId?: string, modelId?: string): ModelOption | undefined {
  if (!catalog || !providerId || !modelId) return undefined;
  for (const capability of catalog.capabilities) {
    const match = capability.models.find((m) => m.providerId === providerId && m.id === modelId);
    if (match) return match;
  }
  return undefined;
}

export { outputPortType };
