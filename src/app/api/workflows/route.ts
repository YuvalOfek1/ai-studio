import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";

const createSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  graph: z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }).optional(),
});

export async function GET(request: Request) {
  return route(async () => {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const workflows = await prisma.workflow.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { runs: true } } },
    });
    return { workflows };
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const body = createSchema.parse(await request.json());
    const workflow = await prisma.workflow.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        description: body.description,
        graph: (body.graph ?? { nodes: [], edges: [] }) as never,
      },
    });
    return { workflow };
  });
}
