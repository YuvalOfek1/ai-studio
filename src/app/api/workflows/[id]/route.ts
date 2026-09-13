import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  graph: z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      runs: { orderBy: { createdAt: "desc" }, take: 10, include: { jobs: { select: { id: true, nodeId: true, status: true } } } },
    },
  });
  if (!workflow) return fail("Workflow not found", 404);
  return route(async () => ({ workflow }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(async () => {
    const body = updateSchema.parse(await request.json());
    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        graph: body.graph as never,
      },
    });
    return { workflow };
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(async () => {
    await prisma.workflow.delete({ where: { id } });
    return { deleted: true };
  });
}
