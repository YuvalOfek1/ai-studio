import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { mediaUrl, putObject } from "@/lib/storage";
import { imageDimensions, kindFromMime, sniffMimeType, wavDurationMs } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Multipart upload: `file` (repeatable) + `projectId`. */
export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  if (!projectId) return fail("projectId is required");
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return fail("No file in the request");

  return route(async () => {
    const assets = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = sniffMimeType(buffer, file.type || "application/octet-stream");
      const stored = await putObject(projectId, buffer, mimeType);
      const { width, height } = imageDimensions(buffer, mimeType);
      const asset = await prisma.asset.create({
        data: {
          projectId,
          kind: kindFromMime(mimeType),
          name: file.name || `upload.${mimeType.split("/")[1] ?? "bin"}`,
          storageKey: stored.key,
          mimeType,
          sizeBytes: stored.size,
          width,
          height,
          durationMs: mimeType === "audio/wav" ? wavDurationMs(buffer) : undefined,
          source: "upload",
        },
      });
      assets.push({ ...asset, url: mediaUrl(asset.storageKey) });
    }
    return { assets };
  });
}
