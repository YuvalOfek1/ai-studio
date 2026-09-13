"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import type { Job } from "@/lib/client/types";
import { MediaPreview } from "./MediaPreview";
import { formatMoney } from "@/lib/pricing/estimate";

const STATUS_STYLE: Record<Job["status"], string> = {
  QUEUED: "text-mist-400 bg-white/5",
  RUNNING: "text-indigo-300 bg-indigo-500/10",
  SUCCEEDED: "text-emerald-300 bg-emerald-500/10",
  FAILED: "text-rose-300 bg-rose-500/10",
  CANCELED: "text-mist-400 bg-white/5",
};

export function JobCard({ job, onCancel }: { job: Job; onCancel?: (id: string) => void }) {
  const running = job.status === "RUNNING" || job.status === "QUEUED";
  const prompt = String(job.params?.prompt ?? job.params?.text ?? job.params?.promptText ?? "");

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={clsx("rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", STATUS_STYLE[job.status])}>
              {job.status.toLowerCase()}
            </span>
            <span className="truncate text-xs text-mist-300">{job.label ?? job.modelId}</span>
            {job.costAmount !== null && job.costAmount !== undefined && (
              <span
                className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-mist-300"
                title={job.costEstimated ? "Estimated from the rate table" : "Priced from what the provider returned"}
              >
                {job.costEstimated ? "≈" : ""}
                {formatMoney(job.costAmount, job.costCurrency ?? "USD")}
              </span>
            )}
          </div>
          {prompt && <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-mist-400">{prompt}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {job.status === "SUCCEEDED" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          {job.status === "FAILED" && <XCircle className="h-4 w-4 text-rose-400" />}
          {running && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
          {running && onCancel && (
            <button onClick={() => onCancel(job.id)} className="text-[11px] text-mist-400 hover:text-rose-400">
              stop
            </button>
          )}
        </div>
      </div>

      {running && (
        <div className="px-3.5 pb-3.5">
          <div className="h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="accent-gradient h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(4, job.progress)}%` }}
            />
          </div>
        </div>
      )}

      {job.error && (
        <div className="mx-3.5 mb-3.5 flex items-start gap-2 rounded-lg bg-rose-500/10 p-2.5 text-[11px] leading-relaxed text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{job.error}</span>
        </div>
      )}

      {job.assets.length > 0 && (
        <div className={clsx("grid gap-px bg-white/5", job.assets.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {job.assets.map((asset) => (
            <div
              key={asset.id}
              className={clsx("group relative bg-ink-850", asset.kind === "AUDIO" ? "p-1" : "aspect-video")}
            >
              <MediaPreview asset={asset} controls={asset.kind !== "IMAGE"} className="h-full w-full" />
              <a
                href={asset.url}
                download={asset.name}
                className="absolute right-2 top-2 rounded-lg bg-ink-950/80 p-1.5 text-mist-300 opacity-0 transition group-hover:opacity-100 hover:text-white"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
