import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { costColumns, resolveRates, usageFromAssets } from "@/lib/pricing/server";
import { costFor } from "@/lib/pricing/estimate";

/**
 * Reprices every job with the rates in force now. Use it after correcting a rate
 * so history matches your invoice instead of a stale guess.
 */
export async function POST() {
  return route(async () => {
    const rates = await resolveRates();
    const jobs = await prisma.job.findMany({
      select: {
        id: true,
        providerId: true,
        modelId: true,
        params: true,
        status: true,
        assets: { select: { kind: true, durationMs: true, meta: true } },
      },
    });

    let repriced = 0;
    for (const job of jobs) {
      const params = (job.params ?? {}) as Record<string, unknown>;
      const actual = job.status === "SUCCEEDED" && job.assets.length ? usageFromAssets(job.assets, params) : undefined;
      const cost = costFor(job.providerId, job.modelId, params, { rates, actual });
      if (!cost) continue;
      await prisma.job.update({ where: { id: job.id }, data: costColumns(cost) });
      repriced += 1;
    }
    return { repriced, jobs: jobs.length };
  });
}
