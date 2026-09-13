import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { deleteObject } from "@/lib/storage";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workflows: { orderBy: { updatedAt: "desc" } },
      _count: { select: { assets: true, jobs: true } },
    },
  });
  if (!project) return fail("Project not found", 404);
  return route(async () => ({ project }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(async () => {
    const body = updateSchema.parse(await request.json());
    return { project: await prisma.project.update({ where: { id }, data: body }) };
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(async () => {
    // media lives outside the database, so clean it up before the rows disappear
    const assets = await prisma.asset.findMany({ where: { projectId: id }, select: { storageKey: true } });
    await Promise.all(assets.map((asset) => deleteObject(asset.storageKey)));
    await prisma.project.delete({ where: { id } });
    return { deleted: true };
  });
}
