"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeftRight,
  AudioLines,
  FastForward,
  Globe,
  Image as ImageIcon,
  Loader2,
  Mic,
  Play,
  Sparkles,
  User,
  Video,
  Wand2,
} from "lucide-react";
import { get, post } from "@/lib/client/api";
import { useProjectStream } from "@/lib/client/useProjectStream";
import type { Catalog, CapabilityGroup, Job, ModelOption, Voice } from "@/lib/client/types";
import { ParamFields } from "./ParamFields";
import { JobCard } from "./JobCard";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  wand: Wand2,
  film: Video,
  play: Play,
  arrows: ArrowLeftRight,
  forward: FastForward,
  mic: Mic,
  speaker: AudioLines,
  user: User,
  globe: Globe,
};

const PRIMARY_KEYS = new Set(["prompt", "text", "promptText"]);

export function Workstation({ projectId }: { projectId: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [capabilityId, setCapabilityId] = useState<string | null>(null);
  const [modelKey, setModelKey] = useState<string>("");
  const [paramsByModel, setParamsByModel] = useState<Record<string, Record<string, unknown>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { jobs, connected } = useProjectStream(projectId);

  useEffect(() => {
    get<Catalog>("/api/catalog").then((data) => {
      setCatalog(data);
      setCapabilityId((current) => current ?? data.capabilities[0]?.id ?? null);
    });
    get<{ voices: Voice[] }>("/api/voices").then((data) => setVoices(data.voices));
  }, []);

  const capability: CapabilityGroup | undefined = useMemo(
    () => catalog?.capabilities.find((c) => c.id === capabilityId),
    [catalog, capabilityId],
  );

  // prefer a model whose provider already has a key, so the default choice works
  useEffect(() => {
    if (!capability || !catalog) return;
    const configured = capability.models.find(
      (m) => !m.needsKey || catalog.configured.includes(m.providerId),
    );
    const chosen = configured ?? capability.models[0];
    setModelKey(chosen ? `${chosen.providerId}:${chosen.id}` : "");
  }, [capability, catalog]);

  const model: ModelOption | undefined = useMemo(() => {
    if (!capability || !modelKey) return undefined;
    const [providerId, modelId] = modelKey.split(":");
    return capability.models.find((m) => m.providerId === providerId && m.id === modelId);
  }, [capability, modelKey]);

  const params = (model && paramsByModel[modelKey]) || {};
  const setParam = (key: string, value: unknown) =>
    setParamsByModel((prev) => ({ ...prev, [modelKey]: { ...(prev[modelKey] ?? {}), [key]: value } }));

  const primaryFields = model?.fields.filter((f) => PRIMARY_KEYS.has(f.key) || ["image", "video", "audio", "voice"].includes(f.type)) ?? [];
  const advancedFields = model?.fields.filter((f) => !primaryFields.includes(f)) ?? [];

  const capabilityJobs = jobs.filter((job) => !job.nodeId);

  async function generate() {
    if (!model) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of model.fields) {
        const value = params[field.key] ?? field.default;
        if (value !== undefined && value !== "") payload[field.key] = value;
      }
      await post<{ job: Job }>("/api/jobs", {
        projectId,
        providerId: model.providerId,
        modelId: model.id,
        params: payload,
        label: model.label,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!catalog) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-mist-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading models…
      </div>
    );
  }

  const providerReady = model ? !model.needsKey || catalog.configured.includes(model.providerId) : false;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8 lg:px-10">
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-mist-400">Workflows</h2>
          <span className={clsx("flex items-center gap-1.5 text-[11px]", connected ? "text-emerald-400" : "text-mist-400")}>
            <span className={clsx("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-mist-400")} />
            {connected ? "live" : "connecting"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {catalog.capabilities.map((item) => {
            const Icon = ICONS[item.icon] ?? Sparkles;
            const active = item.id === capabilityId;
            return (
              <button
                key={item.id}
                onClick={() => setCapabilityId(item.id)}
                className={clsx(
                  "panel panel-hover group flex flex-col items-start gap-2 p-4 text-left",
                  active && "border-accent-400/70 bg-white/[0.07]",
                )}
              >
                <span
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition",
                    active ? "accent-gradient" : "bg-white/8 group-hover:bg-white/12",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] text-white" />
                </span>
                <span className="text-[13px] font-medium text-white">{item.label}</span>
                <span className="text-[11px] leading-snug text-mist-400">{item.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="panel h-fit p-5">
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-mist-300">Model</label>
            <select value={modelKey} onChange={(e) => setModelKey(e.target.value)}>
              {capability?.models.map((option) => {
                const ready = !option.needsKey || catalog.configured.includes(option.providerId);
                return (
                  <option key={`${option.providerId}:${option.id}`} value={`${option.providerId}:${option.id}`}>
                    {option.providerLabel} — {option.label}
                    {ready ? "" : " (no API key)"}
                  </option>
                );
              })}
              {capability?.models.length === 0 && <option value="">No model serves this capability</option>}
            </select>
            {model?.price && <p className="mt-1.5 text-[11px] text-mist-400">Cost: {model.price}</p>}
            {model?.description && <p className="mt-1 text-[11px] text-mist-400">{model.description}</p>}
          </div>

          {model && (
            <>
              <ParamFields
                fields={primaryFields}
                values={params}
                onChange={setParam}
                projectId={projectId}
                voices={voices}
              />

              {advancedFields.length > 0 && (
                <details className="group mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <summary className="cursor-pointer list-none text-xs font-medium text-mist-300 transition hover:text-white">
                    Advanced settings
                    <span className="ml-2 text-[11px] text-mist-400">({advancedFields.length})</span>
                  </summary>
                  <div className="mt-3">
                    <ParamFields
                      fields={advancedFields}
                      values={params}
                      onChange={setParam}
                      projectId={projectId}
                      voices={voices}
                      compact
                    />
                  </div>
                </details>
              )}

              {!providerReady && (
                <p className="mt-4 rounded-lg bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                  {model.providerLabel} has no API key yet. Add one under Providers, or switch to the mock provider to
                  try the flow for free.
                </p>
              )}

              {error && <p className="mt-4 rounded-lg bg-rose-500/10 p-2.5 text-[11px] text-rose-200">{error}</p>}

              <button
                onClick={generate}
                disabled={busy || !providerReady}
                className="accent-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white shadow-lg shadow-indigo-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate
              </button>
            </>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-mist-400">Results</h2>
            <span className="text-[11px] text-mist-400">{capabilityJobs.length} recent</span>
          </div>

          {capabilityJobs.length === 0 ? (
            <div className="panel flex h-64 flex-col items-center justify-center text-center">
              <Sparkles className="mb-3 h-6 w-6 text-mist-400" />
              <p className="text-sm text-mist-300">Nothing generated yet</p>
              <p className="mt-1 max-w-xs text-[11px] text-mist-400">
                Pick a workflow, fill in the prompt and hit generate. Results stream in here as they finish.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {capabilityJobs.map((job) => (
                <JobCard key={job.id} job={job} onCancel={(id) => post(`/api/jobs/${id}/cancel`)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
