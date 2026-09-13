import { Queue, type ConnectionOptions } from "bullmq";
import { env } from "./env";

export const JOB_QUEUE = "generation";
export const RUN_QUEUE = "workflow-run";

export function redisConnection(): ConnectionOptions {
  const url = new URL(env.redisUrl());
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

const globalForQueue = globalThis as unknown as { jobQueue?: Queue; runQueue?: Queue };

export const jobQueue: Queue =
  globalForQueue.jobQueue ??
  new Queue(JOB_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: { removeOnComplete: 500, removeOnFail: 500, attempts: 1 },
  });

export const runQueue: Queue =
  globalForQueue.runQueue ??
  new Queue(RUN_QUEUE, {
    connection: redisConnection(),
    defaultJobOptions: { removeOnComplete: 200, removeOnFail: 200, attempts: 1 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.jobQueue = jobQueue;
  globalForQueue.runQueue = runQueue;
}

export async function enqueueGeneration(jobId: string) {
  await jobQueue.add("generate", { jobId }, { jobId: `gen-${jobId}` });
}

export async function enqueueWorkflowRun(runId: string) {
  await runQueue.add("run", { runId }, { jobId: `run-${runId}` });
}
