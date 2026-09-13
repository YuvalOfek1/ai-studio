import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-sent events: one stream per project carrying live job and run state, so
 * the workstation and the canvas both update without every component polling.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let lastSignature = "";
      const tick = async () => {
        if (closed) return;
        try {
          const jobs = await prisma.job.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            take: 30,
            include: { assets: true },
          });
          const runs = await prisma.workflowRun.findMany({
            where: { workflow: { projectId } },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { jobs: { select: { id: true, nodeId: true, status: true, error: true } } },
          });

          const signature = JSON.stringify([
            jobs.map((j) => [j.id, j.status, j.progress, j.assets.length]),
            runs.map((r) => [r.id, r.status, r.jobs.map((j) => [j.id, j.status])]),
          ]);
          if (signature !== lastSignature) {
            lastSignature = signature;
            send("state", {
              jobs: jobs.map((job) => ({
                ...job,
                assets: job.assets.map((asset) => ({ ...asset, url: mediaUrl(asset.storageKey) })),
              })),
              runs,
            });
          } else {
            send("ping", { at: Date.now() });
          }
        } catch (error) {
          send("error", { message: error instanceof Error ? error.message : "stream error" });
        }
      };

      await tick();
      const interval = setInterval(tick, 1500);
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // the client is already gone
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
