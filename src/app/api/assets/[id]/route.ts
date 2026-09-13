import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { deleteObject } from "@/lib/storage";

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
