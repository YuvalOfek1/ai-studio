import { getObject } from "@/lib/storage";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Serves stored media. Works the same whether the driver is local disk or S3. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = segments.map(decodeURIComponent).join("/");

  // only serve keys we know about, so this can never become a path-traversal read
  const asset = await prisma.asset.findFirst({ where: { storageKey: key } });
  if (!asset) return new Response("Not found", { status: 404 });

  try {
    const { body, mimeType } = await getObject(key);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": mimeType || asset.mimeType,
        "content-length": String(body.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
        "content-disposition": `inline; filename="${encodeURIComponent(asset.name)}"`,
      },
    });
  } catch {
    return new Response("Media missing from storage", { status: 404 });
  }
}
