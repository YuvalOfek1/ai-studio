import Link from "next/link";
import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import { AudioLines } from "lucide-react";
import { SyncVoicesButton } from "@/components/SyncVoicesButton";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const voices = await prisma.voice.findMany({
    orderBy: { createdAt: "desc" },
    include: { sampleAsset: { select: { storageKey: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-10 lg:px-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-mist-400">Library</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Voices</h1>
          <p className="mt-2 max-w-xl text-sm text-mist-400">
            Voices you cloned from an mp3, plus anything already in your provider account. Every voice over and dubbing
            workflow can use them.
          </p>
        </div>
        <SyncVoicesButton />
      </header>

      {voices.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
          <AudioLines className="mb-3 h-7 w-7 text-mist-400" />
          <h2 className="text-sm font-medium text-white">No voices yet</h2>
          <p className="mt-2 max-w-sm text-xs text-mist-400">
            Open a project, choose the <strong className="text-mist-200">Clone voice</strong> workflow and upload an mp3
            — the cloned voice lands here and becomes selectable everywhere.
          </p>
          <Link href="/" className="accent-gradient mt-5 rounded-xl px-4 py-2 text-xs font-medium text-white">
            Go to projects
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {voices.map((voice) => (
            <div key={voice.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-white">{voice.name}</h3>
                  <p className="mt-0.5 text-[11px] text-mist-400">
                    {voice.providerId} · <span className="font-mono">{voice.providerVoiceId.slice(0, 16)}</span>
                  </p>
                  {voice.description && <p className="mt-2 text-[11px] text-mist-400">{voice.description}</p>}
                </div>
                <AudioLines className="h-4 w-4 shrink-0 text-emerald-400" />
              </div>
              {voice.sampleAsset && (
                <audio src={mediaUrl(voice.sampleAsset.storageKey)} controls className="mt-3 w-full" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
