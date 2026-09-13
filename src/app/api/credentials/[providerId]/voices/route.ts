import { prisma } from "@/lib/db";
import { fail, route } from "@/lib/api";
import { getProvider } from "@/lib/providers/registry";
import { resolveCredential } from "@/lib/providers/credentials";

/** Pulls the voices that live in the user's vendor account into the local list. */
export async function POST(_request: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider.listVoices) return fail(`${provider.label} has no voice library`, 400);

  return route(async () => {
    const credential = await resolveCredential(providerId);
    const voices = await provider.listVoices!(credential);
    for (const voice of voices) {
      await prisma.voice.upsert({
        where: { providerId_providerVoiceId: { providerId, providerVoiceId: voice.id } },
        create: { providerId, providerVoiceId: voice.id, name: voice.name, description: voice.description },
        update: { name: voice.name, description: voice.description },
      });
    }
    return { synced: voices.length, voices: await prisma.voice.findMany({ orderBy: { createdAt: "desc" } }) };
  });
}
