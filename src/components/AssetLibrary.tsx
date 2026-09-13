"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { Download, Expand, Trash2, Upload } from "lucide-react";
import { del, post } from "@/lib/client/api";
import { useProjectAssets } from "./AssetPicker";
import { MediaPreview } from "./MediaPreview";
import { MediaLightbox } from "./MediaLightbox";
import type { Asset } from "@/lib/client/types";

const FILTERS = [
  { id: "ALL", label: "Everything" },
  { id: "IMAGE", label: "Images" },
  { id: "VIDEO", label: "Video" },
  { id: "AUDIO", label: "Audio" },
] as const;

function formatSize(bytes: number) {
  if (bytes > 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function AssetLibrary({ projectId }: { projectId: string }) {
  const { assets, refresh } = useProjectAssets(projectId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("ALL");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      const form = new FormData();
      form.append("projectId", projectId);
      for (const file of Array.from(files)) form.append("file", file);
      try {
        await post("/api/assets/upload", form);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [projectId, refresh],
  );

  const visible = assets.filter((asset) => filter === "ALL" || asset.kind === filter);

  return (
    <div
      className="mx-auto w-full max-w-[1500px] px-6 py-8 lg:px-10"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        upload(e.dataTransfer.files);
      }}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs transition",
                filter === item.id ? "bg-white/10 text-white" : "text-mist-400 hover:text-mist-200",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs text-mist-200 transition hover:border-accent-400/60 hover:text-white disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Upload files"}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="panel flex h-72 flex-col items-center justify-center text-center">
          <Upload className="mb-3 h-6 w-6 text-mist-400" />
          <p className="text-sm text-mist-300">Nothing here yet</p>
          <p className="mt-1 max-w-xs text-[11px] text-mist-400">
            Drag files anywhere on this page, or generate something from the workstation.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((asset: Asset) => (
            <div key={asset.id} className="panel panel-hover group overflow-hidden">
              <button
                type="button"
                onClick={() => setPreview(visible.indexOf(asset))}
                className="relative block aspect-square w-full cursor-zoom-in"
                title="Open preview"
              >
                <MediaPreview asset={asset} controls={false} hoverPlay className="h-full w-full" />
                <span className="absolute inset-0 flex items-center justify-center bg-ink-950/45 opacity-0 transition group-hover:opacity-100">
                  <Expand className="h-5 w-5 text-white" />
                </span>
              </button>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-xs text-mist-200">{asset.name}</p>
                  <p className="text-[10px] text-mist-400">
                    {asset.source === "generated" ? "generated" : "uploaded"} · {formatSize(asset.sizeBytes)}
                    {asset.width ? ` · ${asset.width}×${asset.height}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <a
                    href={asset.url}
                    download={asset.name}
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5 hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={async () => {
                      await del(`/api/assets/${asset.id}`);
                      refresh();
                    }}
                    className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview !== null && visible[preview] && (
        <MediaLightbox
          assets={visible}
          index={preview}
          onIndexChange={setPreview}
          onClose={() => setPreview(null)}
          onDelete={async (asset) => {
            await del(`/api/assets/${asset.id}`);
            setPreview(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
