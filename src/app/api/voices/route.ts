import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { mediaUrl } from "@/lib/storage";

export async function GET() {
  return route(async () => {
    const voices = await prisma.voice.findMany({
      orderBy: { createdAt: "desc" },
      include: { sampleAsset: { select: { storageKey: true, mimeType: true } } },
    });
    return {
      voices: voices.map((voice) => ({
        ...voice,
        sampleUrl: voice.sampleAsset ? mediaUrl(voice.sampleAsset.storageKey) : null,
      })),
    };
  });
}
