import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { mediaUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id }, include: { assets: true } });
  if (!job) return fail("Job not found", 404);
  return route(async () => ({
    job: { ...job, assets: job.assets.map((asset) => ({ ...asset, url: mediaUrl(asset.storageKey) })) },
  }));
}
