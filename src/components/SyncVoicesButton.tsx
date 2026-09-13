"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { post } from "@/lib/client/api";

export function SyncVoicesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      await post("/api/credentials/elevenlabs/voices");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={sync}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-mist-200 transition hover:border-accent-400/60 hover:text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Sync from ElevenLabs
      </button>
      {error && <p className="mt-2 max-w-xs text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
