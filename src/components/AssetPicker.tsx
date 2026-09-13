"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import clsx from "clsx";
import { get, post } from "@/lib/client/api";
import type { Asset } from "@/lib/client/types";
import { MediaPreview } from "./MediaPreview";

type Kind = "IMAGE" | "VIDEO" | "AUDIO";

/**
 * One input slot: pick an existing project asset, or drop/upload a new file.
 * Used by the workstation and by asset nodes on the canvas.
 */
export function AssetSlot({
  projectId,
  kind,
  label,
  value,
  onChange,
  compact = false,
}: {
  projectId: string;
  kind: Kind;
  label: string;
  value?: string;
  onChange: (assetId: string | undefined, asset?: Asset) => void;
  compact?: boolean;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await get<{ assets: Asset[] }>(`/api/assets?projectId=${projectId}&kind=${kind}&limit=60`);
    setAssets(data.assets);
    return data.assets;
  }, [projectId, kind]);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const known = assets.find((a) => a.id === value);
    if (known) {
      setSelected(known);
      return;
    }
    load().then((list) => setSelected(list.find((a) => a.id === value) ?? null));
  }, [value, assets, load]);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("projectId", projectId);
        for (const file of Array.from(files)) form.append("file", file);
        const { assets: uploaded } = await post<{ assets: Asset[] }>("/api/assets/upload", form);
        const first = uploaded[0];
        if (first) {
          setAssets((prev) => [first, ...prev]);
          setSelected(first);
          onChange(first.id, first);
        }
        setOpen(false);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [projectId, onChange],
  );

  const accept = kind === "IMAGE" ? "image/*" : kind === "VIDEO" ? "video/*" : "audio/*,video/*";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-mist-300">{label}</label>
        {selected && (
          <button
            onClick={() => {
              setSelected(null);
              onChange(undefined);
            }}
            className="text-[11px] text-mist-400 transition hover:text-rose-400"
          >
            clear
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        className={clsx(
          "group relative overflow-hidden rounded-xl border border-dashed border-white/12 bg-white/[0.02] transition hover:border-accent-400/60",
          compact ? "h-24" : "h-36",
        )}
      >
        {selected ? (
          <button className="h-full w-full" onClick={() => setOpen(true)} type="button">
            <MediaPreview asset={selected} controls={false} className="h-full w-full" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-mist-400 transition group-hover:text-mist-200"
          >
            <Upload className="h-4 w-4" />
            <span className="text-[11px]">Drop, upload or pick</span>
          </button>
        )}
        {busy && <div className="shimmer absolute inset-0" />}
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-400">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm">
          <div className="panel flex max-h-[80vh] w-full max-w-3xl flex-col p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Choose {kind.toLowerCase()}</h3>
                <p className="text-[11px] text-mist-400">From this project, or upload something new.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-mist-400 hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept={accept}
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-xs text-mist-300 transition hover:border-accent-400/60 hover:text-white"
            >
              <Upload className="h-4 w-4" /> Upload from your computer
            </button>

            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => {
                    setSelected(asset);
                    onChange(asset.id, asset);
                    setOpen(false);
                  }}
                  className={clsx(
                    "overflow-hidden rounded-xl border transition",
                    value === asset.id ? "border-accent-400" : "border-white/8 hover:border-white/25",
                  )}
                >
                  <div className="aspect-square">
                    <MediaPreview asset={asset} controls={false} className="h-full w-full" />
                  </div>
                  <p className="truncate px-2 py-1.5 text-left text-[10px] text-mist-400">{asset.name}</p>
                </button>
              ))}
              {assets.length === 0 && (
                <p className="col-span-full py-10 text-center text-xs text-mist-400">
                  No {kind.toLowerCase()} assets yet — upload one above.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function useProjectAssets(projectId: string, kind?: Kind) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const refresh = useCallback(async () => {
    const query = new URLSearchParams({ projectId, limit: "200" });
    if (kind) query.set("kind", kind);
    const data = await get<{ assets: Asset[] }>(`/api/assets?${query}`);
    setAssets(data.assets);
  }, [projectId, kind]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { assets, refresh };
}
