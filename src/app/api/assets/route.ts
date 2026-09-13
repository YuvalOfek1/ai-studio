import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { mediaUrl } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

const querySchema = z.object({
  projectId: z.string().optional(),
  kind: z.enum(["IMAGE", "VIDEO", "AUDIO"]).optional(),
  limit: z.coerce.number().min(1).max(200).default(100),
});

export async function GET(request: Request) {
  return route(async () => {
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(searchParams));
    const where: Prisma.AssetWhereInput = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.kind) where.kind = query.kind;

    const assets = await prisma.asset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { job: { select: { id: true, capability: true, providerId: true, modelId: true } } },
    });
    return { assets: assets.map((asset) => ({ ...asset, url: mediaUrl(asset.storageKey) })) };
  });
}
