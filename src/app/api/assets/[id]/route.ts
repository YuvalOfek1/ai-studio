import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { deleteObject } from "@/lib/storage";

const metaSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
});

/**
 * Video and audio dimensions/duration need a decoder, which the server does not
 * have — the player reports them the first time you preview a file, and they are
 * stored so the library can show them from then on.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return route(async () => {
    const body = metaSchema.parse(await request.json());
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new Error("Asset not found");
    return {
      asset: await prisma.asset.update({
        where: { id },
        data: {
          width: asset.width ?? body.width,
          height: asset.height ?? body.height,
          durationMs: asset.durationMs ?? body.durationMs,
        },
      }),
    };
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return fail("Asset not found", 404);
  return route(async () => {
    await deleteObject(asset.storageKey);
    await prisma.asset.delete({ where: { id } });
    return { deleted: true };
  });
}
