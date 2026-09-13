import { prisma } from "../db";
import { runJob } from "../jobs/runner";
import { topologicalOrder, type FlowGraph, type FlowNodeData } from "./nodes";
import { getModel } from "../providers/registry";
import { costColumns, costForJob } from "../pricing/server";

/**
 * Executes a saved node graph. Nodes run in topological order; a generation node
 * becomes a real Job row (same pipeline as the workstation) and its produced asset
 * flows into whatever is wired downstream.
 */

type NodeValue =
  | { type: "text"; value: string }
  | { type: "asset"; assetId: string; kind: string }
  | { type: "voice"; voiceId: string };

function valueForParam(value: NodeValue): string {
  switch (value.type) {
    case "text":
      return value.value;
    case "asset":
      return value.assetId;
    case "voice":
      return value.voiceId;
  }
}

export async function runWorkflow(runId: string): Promise<void> {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId }, include: { workflow: true } });
  if (!run) throw new Error(`Workflow run ${runId} not found`);

  const graph = run.workflow.graph as unknown as FlowGraph;
  const projectId = run.workflow.projectId;
  await prisma.workflowRun.update({ where: { id: runId }, data: { status: "RUNNING", startedAt: new Date(), error: null } });

  const outputsByNode = new Map<string, NodeValue>();
  const deliverables: { nodeId: string; assetId?: string; text?: string }[] = [];

  try {
    const order = topologicalOrder(graph);
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

    for (const nodeId of order) {
      const node = nodesById.get(nodeId);
      if (!node) continue;
      const data = node.data as FlowNodeData;

      // everything wired into this node, keyed by the target handle
      const incoming = new Map<string, NodeValue>();
      for (const edge of graph.edges) {
        if (edge.target !== nodeId) continue;
        const upstream = outputsByNode.get(edge.source);
        if (upstream) incoming.set(edge.targetHandle || "input", upstream);
      }

      switch (data.kind) {
        case "text":
          outputsByNode.set(nodeId, { type: "text", value: String(data.text ?? "") });
          break;

        case "asset":
          if (!data.assetId) throw new Error(`Asset node "${data.label ?? nodeId}" has no asset selected`);
          outputsByNode.set(nodeId, { type: "asset", assetId: data.assetId, kind: data.assetKind ?? "IMAGE" });
          break;

        case "voice":
          if (!data.voiceId) throw new Error(`Voice node "${data.label ?? nodeId}" has no voice selected`);
          outputsByNode.set(nodeId, { type: "voice", voiceId: data.voiceId });
          break;

        case "output": {
          const input = incoming.get("input");
          if (input) {
            deliverables.push(
              input.type === "asset" ? { nodeId, assetId: input.assetId } : { nodeId, text: valueForParam(input) },
            );
          }
          break;
        }

        case "generate": {
          if (!data.providerId || !data.modelId) {
            throw new Error(`Generation node "${data.label ?? nodeId}" has no model selected`);
          }
          const model = getModel(data.providerId, data.modelId);
          const params: Record<string, unknown> = { ...(data.params ?? {}) };
          for (const [handle, value] of incoming) {
            params[handle] = valueForParam(value);
          }

          const estimate = await costForJob(data.providerId, data.modelId, params);
          const job = await prisma.job.create({
            data: {
              projectId,
              capability: model.capability,
              providerId: data.providerId,
              modelId: data.modelId,
              label: data.label ?? model.label,
              params: params as never,
              workflowRunId: runId,
              nodeId,
              ...costColumns(estimate),
            },
          });

          await runJob(job.id);

          const assets = await prisma.asset.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" } });
          if (!assets.length) throw new Error(`Node "${data.label ?? model.label}" produced no output`);

          if (model.capability === "audio.voiceClone") {
            const voice = await prisma.voice.findFirst({
              where: { sampleAssetId: assets[0].id },
              orderBy: { createdAt: "desc" },
            });
            if (!voice) throw new Error("Voice clone produced no voice");
            outputsByNode.set(nodeId, { type: "voice", voiceId: voice.providerVoiceId });
          } else {
            outputsByNode.set(nodeId, { type: "asset", assetId: assets[0].id, kind: assets[0].kind });
          }
          break;
        }
      }
    }

    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "SUCCEEDED", finishedAt: new Date(), outputs: { deliverables } as never },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "FAILED", error: message.slice(0, 2000), finishedAt: new Date(), outputs: { deliverables } as never },
    });
    throw error;
  }
}
