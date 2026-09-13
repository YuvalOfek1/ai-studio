import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { mediaUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.workflowRun.findUnique({
    where: { id },
    include: { jobs: { include: { assets: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!run) return fail("Run not found", 404);
  return route(async () => ({
    run: {
      ...run,
      jobs: run.jobs.map((job) => ({
        ...job,
        assets: job.assets.map((asset) => ({ ...asset, url: mediaUrl(asset.storageKey) })),
      })),
    },
  }));
}
