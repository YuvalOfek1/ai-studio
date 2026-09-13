import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

export async function GET() {
  return route(async () => {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { assets: true, jobs: true, workflows: true } } },
    });
    const covers = await prisma.asset.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, kind: { in: ["IMAGE", "VIDEO"] } },
      orderBy: { createdAt: "desc" },
      distinct: ["projectId"],
      select: { projectId: true, storageKey: true, mimeType: true, kind: true },
    });
    const coverByProject = new Map(covers.map((c) => [c.projectId, c]));
    return {
      projects: projects.map((project) => ({ ...project, cover: coverByProject.get(project.id) ?? null })),
    };
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const body = createSchema.parse(await request.json());
    const project = await prisma.project.create({ data: body });
    // a project starts with an empty canvas so the flow editor is never a blank page
    await prisma.workflow.create({ data: { projectId: project.id, name: "Main flow" } });
    return { project };
  });
}
