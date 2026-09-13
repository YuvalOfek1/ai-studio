import { z } from "zod";
import { prisma } from "@/lib/db";
import { BadRequestError, route } from "@/lib/api";
import { enqueueGeneration } from "@/lib/queue";
import { getModel } from "@/lib/providers/registry";
import { mediaUrl } from "@/lib/storage";
import { costColumns, costForJob } from "@/lib/pricing/server";
import type { Prisma } from "@prisma/client";

const createSchema = z.object({
  projectId: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
  label: z.string().max(200).optional(),
});

const querySchema = z.object({
  projectId: z.string().optional(),
  status: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(40),
});

export async function GET(request: Request) {
  return route(async () => {
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(searchParams));
    const where: Prisma.JobWhereInput = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { assets: true },
    });
    return {
      jobs: jobs.map((job) => ({
        ...job,
        assets: job.assets.map((asset) => ({ ...asset, url: mediaUrl(asset.storageKey) })),
      })),
    };
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const body = createSchema.parse(await request.json());
    const model = getModel(body.providerId, body.modelId); // validates the pair exists

    // required fields are checked here so the user sees the problem instantly,
    // instead of a job that fails a minute later in the worker
    for (const field of model.fields) {
      if (!field.required) continue;
      const value = body.params[field.key];
      if (value === undefined || value === null || value === "") {
        throw new BadRequestError(`"${field.label}" is required`);
      }
    }

    const estimate = await costForJob(body.providerId, body.modelId, body.params);
    const job = await prisma.job.create({
      data: {
        projectId: body.projectId,
        capability: model.capability,
        providerId: body.providerId,
        modelId: body.modelId,
        label: body.label ?? model.label,
        params: body.params as never,
        ...costColumns(estimate),
      },
    });
    await enqueueGeneration(job.id);
    return { job };
  });
}
