import { prisma } from "../db";
import { putObject } from "../storage";
import { imageDimensions, kindFromMime, sniffMimeType, wavDurationMs } from "../media";
import { getModel, getProvider } from "../providers/registry";
import { resolveCredential } from "../providers/credentials";
import { costColumns, costForJob, usageFromAssets } from "../pricing/server";
import {
  ProviderError,
  type MediaInput,
  type ModelSpec,
  type PollResult,
  type ProviderOutput,
} from "../providers/types";
import type { Job } from "@prisma/client";

/**
 * The generation pipeline: resolve inputs → submit to the vendor → poll → download
 * the result → store it as an Asset. Runs inside the BullMQ worker, never in a
 * request handler: these calls take minutes.
 */

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 20 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function logger(jobId: string) {
  return (message: string) => console.log(`[job ${jobId}] ${message}`);
}

/** Media params hold an asset id; the adapter needs the bytes. */
async function resolveMedia(model: ModelSpec, params: Record<string, unknown>): Promise<Record<string, MediaInput>> {
  const mediaFields = model.fields.filter((f) => ["image", "video", "audio"].includes(f.type));
  const media: Record<string, MediaInput> = {};

  for (const field of mediaFields) {
    const value = params[field.key];
    const assetId = typeof value === "string" ? value : (value as { assetId?: string } | null)?.assetId;
    if (!assetId) {
      if (field.required) throw new ProviderError(`"${field.label}" is required`);
      continue;
    }
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new ProviderError(`Input asset ${assetId} no longer exists`);
    const { getObject } = await import("../storage");
    const { body } = await getObject(asset.storageKey);
    media[field.key] = {
      buffer: body,
      mimeType: asset.mimeType,
      base64: body.toString("base64"),
      dataUri: `data:${asset.mimeType};base64,${body.toString("base64")}`,
      fileName: asset.name || `input-${asset.id}`,
    };
  }
  return media;
}

async function download(output: ProviderOutput): Promise<{ data: Buffer; mimeType: string }> {
  if (output.data) return { data: output.data, mimeType: output.mimeType };
  if (!output.url) throw new ProviderError("Provider output had neither data nor a URL");
  const res = await fetch(output.url);
  if (!res.ok) throw new ProviderError(`Downloading result failed (HTTP ${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  const headerType = res.headers.get("content-type")?.split(";")[0];
  return { data, mimeType: sniffMimeType(data, headerType || output.mimeType) };
}

async function persistOutputs(job: Job, outputs: ProviderOutput[]) {
  const created = [];
  for (const output of outputs) {
    const { data, mimeType } = await download(output);
    const stored = await putObject(job.projectId, data, mimeType);
    const { width, height } = imageDimensions(data, mimeType);
    const asset = await prisma.asset.create({
      data: {
        projectId: job.projectId,
        kind: output.kind ?? kindFromMime(mimeType),
        name: output.name ?? `${job.modelId}-${stored.key.split("/").pop()}`,
        storageKey: stored.key,
        mimeType,
        sizeBytes: stored.size,
        width,
        height,
        durationMs: mimeType === "audio/wav" ? wavDurationMs(data) : undefined,
        source: "generated",
        jobId: job.id,
        meta: {
          providerId: job.providerId,
          modelId: job.modelId,
          capability: job.capability,
          ...(output.meta ?? {}),
        },
      },
    });
    created.push(asset);

    // A cloned voice is not a file — register it so every voice over can use it.
    if (output.voice) {
      await prisma.voice.upsert({
        where: { providerId_providerVoiceId: { providerId: job.providerId, providerVoiceId: output.voice.providerVoiceId } },
        create: {
          name: output.voice.name,
          providerId: job.providerId,
          providerVoiceId: output.voice.providerVoiceId,
          sampleAssetId: asset.id,
        },
        update: { name: output.voice.name, sampleAssetId: asset.id },
      });
    }
  }
  return created;
}

export async function runJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status === "CANCELED") return;

  const log = logger(jobId);
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), progress: 1, attempts: { increment: 1 }, error: null },
  });

  try {
    const provider = getProvider(job.providerId);
    const model = getModel(job.providerId, job.modelId);
    const params = (job.params ?? {}) as Record<string, unknown>;
    const credential = await resolveCredential(job.providerId);
    const media = await resolveMedia(model, params);

    const submitted = await provider.submit({ jobId, model, params, media, credential, log });

    let outputs: ProviderOutput[];
    if (submitted.kind === "done") {
      outputs = submitted.outputs;
    } else {
      await prisma.job.update({
        where: { id: jobId },
        data: { providerTaskId: submitted.taskId, progress: 5 },
      });
      if (!provider.poll) throw new ProviderError(`${provider.label} returned a task but has no poll implementation`);

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let result: PollResult = { status: "running" };
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        const current = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
        if (current?.status === "CANCELED") {
          log("canceled while polling");
          return;
        }
        result = await provider.poll({
          taskId: submitted.taskId,
          meta: (submitted.meta ?? {}) as Record<string, unknown>,
          model,
          params,
          credential,
          log,
        });
        if (result.status !== "running") break;
        if (result.progress !== undefined) {
          await prisma.job.update({ where: { id: jobId }, data: { progress: Math.min(95, result.progress) } });
        }
      }

      if (result.status === "running") throw new ProviderError("Timed out waiting for the provider");
      if (result.status === "failed") throw new ProviderError(result.error);
      outputs = result.outputs;
    }

    await prisma.job.update({ where: { id: jobId }, data: { progress: 97 } });
    const assets = await persistOutputs(job, outputs);

    // the estimate guessed at clip length and image count; now we know
    const actual = await costForJob(job.providerId, job.modelId, params, usageFromAssets(assets, params));
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "SUCCEEDED", progress: 100, finishedAt: new Date(), ...costColumns(actual) },
    });
    log(`succeeded with ${assets.length} asset(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`failed: ${message}`);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", error: message.slice(0, 2000), finishedAt: new Date() },
    });
    throw error;
  }
}
