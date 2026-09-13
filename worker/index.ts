import "../src/lib/load-env";
import { Worker } from "bullmq";
import { JOB_QUEUE, RUN_QUEUE, redisConnection } from "../src/lib/queue";
import { runJob } from "../src/lib/jobs/runner";
import { runWorkflow } from "../src/lib/engine/graph";

/**
 * The background worker. Generations take minutes, so nothing here runs inside a
 * Next.js request. Start it with `npm run worker` next to `npm run dev`.
 */

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

const generationWorker = new Worker(
  JOB_QUEUE,
  async (job) => {
    const { jobId } = job.data as { jobId: string };
    console.log(`[worker] generation ${jobId}`);
    await runJob(jobId);
  },
  { connection: redisConnection(), concurrency: CONCURRENCY },
);

const workflowWorker = new Worker(
  RUN_QUEUE,
  async (job) => {
    const { runId } = job.data as { runId: string };
    console.log(`[worker] workflow run ${runId}`);
    await runWorkflow(runId);
  },
  { connection: redisConnection(), concurrency: Math.max(1, Math.floor(CONCURRENCY / 2)) },
);

for (const [name, worker] of [
  ["generation", generationWorker],
  ["workflow", workflowWorker],
] as const) {
  worker.on("failed", (job, err) => console.error(`[worker] ${name} ${job?.id} failed:`, err.message));
  worker.on("completed", (job) => console.log(`[worker] ${name} ${job.id} completed`));
}

console.log(`[worker] listening on "${JOB_QUEUE}" and "${RUN_QUEUE}" (concurrency ${CONCURRENCY})`);

async function shutdown() {
  console.log("[worker] shutting down");
  await Promise.allSettled([generationWorker.close(), workflowWorker.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
