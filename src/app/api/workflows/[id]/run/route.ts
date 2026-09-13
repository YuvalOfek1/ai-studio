import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { enqueueWorkflowRun } from "@/lib/queue";
import { topologicalOrder, type FlowGraph } from "@/lib/engine/nodes";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) return fail("Workflow not found", 404);

  const graph = workflow.graph as unknown as FlowGraph;
  if (!graph.nodes?.length) return fail("This flow is empty — drag in a node first", 400);

  return route(async () => {
    topologicalOrder(graph); // fail fast on cycles, before a run row exists
    const run = await prisma.workflowRun.create({ data: { workflowId: id } });
    await enqueueWorkflowRun(run.id);
    return { run };
  });
}
