"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { del, get, post } from "@/lib/client/api";

interface CredentialStatus {
  providerId: string;
  label: string;
  website: string;
  docs: string;
  credentialLabel: string;
  help: string;
  envVar: string;
  extraEnv: { key: string; envVar: string; label: string }[];
  configured: boolean;
  source: "database" | "environment" | null;
  masked: string | null;
  meta: Record<string, string>;
  capabilities: string[];
}

export function ProviderSettings() {
  const [credentials, setCredentials] = useState<CredentialStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { secret: string; meta: Record<string, string> }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => get<{ credentials: CredentialStatus[] }>("/api/credentials").then((d) => setCredentials(d.credentials));

  useEffect(() => {
    load();
  }, []);

  async function save(providerId: string) {
    const draft = drafts[providerId];
    if (!draft?.secret?.trim()) return;
    setBusy(providerId);
    setError(null);
    setMessage(null);
    try {
      await post("/api/credentials", { providerId, secret: draft.secret.trim(), meta: draft.meta ?? {} });
      setDrafts((prev) => ({ ...prev, [providerId]: { secret: "", meta: {} } }));
      await load();
      setMessage(`${providerId} key saved`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(providerId: string) {
    setBusy(providerId);
    try {
      await del(`/api/credentials/${providerId}`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function syncVoices(providerId: string) {
    setBusy(providerId);
    setError(null);
    try {
      const res = await post<{ synced: number }>(`/api/credentials/${providerId}/voices`);
      setMessage(`Synced ${res.synced} voices from ${providerId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {message && <p className="rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-200">{message}</p>}
      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}

      {credentials.map((credential) => {
        const draft = drafts[credential.providerId] ?? { secret: "", meta: {} };
        return (
          <div key={credential.providerId} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-white">{credential.label}</h2>
                  {credential.configured ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      {credential.masked} · {credential.source}
                    </span>
                  ) : (
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-mist-400">not configured</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-mist-400">{credential.help}</p>
                <p className="mt-1 text-[11px] text-mist-400">
                  Serves: {credential.capabilities.join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {credential.providerId === "elevenlabs" && credential.configured && (
                  <button
                    onClick={() => syncVoices(credential.providerId)}
                    disabled={busy === credential.providerId}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-mist-300 transition hover:text-white"
                  >
                    <RefreshCw className={clsx("h-3 w-3", busy === credential.providerId && "animate-spin")} />
                    Sync voices
                  </button>
                )}
                <a
                  href={credential.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-mist-300 transition hover:text-white"
                >
                  <ExternalLink className="h-3 w-3" /> Console
                </a>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1">
                <label className="mb-1.5 block text-[11px] text-mist-400">{credential.credentialLabel}</label>
                <input
                  type="password"
                  value={draft.secret}
                  placeholder={credential.configured ? "Replace the stored key…" : `Paste your key (or set ${credential.envVar})`}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [credential.providerId]: { ...draft, secret: e.target.value },
                    }))
                  }
                />
              </div>

              {credential.extraEnv.map((extra) => (
                <div key={extra.key} className="w-[200px]">
                  <label className="mb-1.5 block text-[11px] text-mist-400">{extra.label}</label>
                  <input
                    type="text"
                    value={draft.meta?.[extra.key] ?? credential.meta[extra.key] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [credential.providerId]: {
                          ...draft,
                          meta: { ...(draft.meta ?? {}), [extra.key]: e.target.value },
                        },
                      }))
                    }
                  />
                </div>
              ))}

              <button
                onClick={() => save(credential.providerId)}
                disabled={busy === credential.providerId || !draft.secret.trim()}
                className="accent-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {busy === credential.providerId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Save key
              </button>

              {credential.source === "database" && (
                <button
                  onClick={() => remove(credential.providerId)}
                  className="rounded-xl border border-white/10 p-2.5 text-mist-400 transition hover:border-rose-400/40 hover:text-rose-400"
                  title="Remove stored key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
