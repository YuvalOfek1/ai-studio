import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { jobQueue } from "@/lib/queue";

/** Marks the job canceled; the worker checks this flag between polls. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(async () => {
    const queued = await jobQueue.getJob(`gen-${id}`);
    if (queued) await queued.remove().catch(() => undefined);
    const job = await prisma.job.update({
      where: { id },
      data: { status: "CANCELED", finishedAt: new Date() },
    });
    return { job };
  });
}
