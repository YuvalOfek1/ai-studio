"use client";

import { useCallback, useEffect, useState } from "react";
import { patch } from "@/lib/client/api";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Maximize2, Minimize2, Trash2, X } from "lucide-react";
import type { Asset } from "@/lib/client/types";

/**
 * Full-size preview. Images open fitted with a toggle to 1:1, video plays with
 * real controls, audio gets a player — and arrow keys walk the set you opened it
 * from, so a batch of results can be reviewed without closing anything.
 */

function formatSize(bytes: number) {
  if (bytes > 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes > 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Report what the decoder knows, once, for files the server could not measure. */
function reportMetadata(asset: Asset, element: HTMLVideoElement | HTMLAudioElement) {
  const isVideo = element instanceof HTMLVideoElement;
  const width = isVideo ? element.videoWidth : undefined;
  const height = isVideo ? element.videoHeight : undefined;
  const durationMs = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : undefined;
  if (asset.width && asset.durationMs) return null;
  const payload: Record<string, number> = {};
  if (width && !asset.width) payload.width = width;
  if (height && !asset.height) payload.height = height;
  if (durationMs && !asset.durationMs) payload.durationMs = durationMs;
  if (!Object.keys(payload).length) return null;
  patch(`/api/assets/${asset.id}`, payload).catch(() => undefined);
  return payload;
}

function details(asset: Asset): string {
  const parts: string[] = [asset.kind.toLowerCase()];
  if (asset.width && asset.height) parts.push(`${asset.width}×${asset.height}`);
  if (asset.durationMs) parts.push(`${(asset.durationMs / 1000).toFixed(1)}s`);
  parts.push(formatSize(asset.sizeBytes));
  const meta = (asset.meta ?? {}) as { providerId?: string; modelId?: string };
  if (meta.modelId) parts.push(`${meta.providerId ?? ""} ${meta.modelId}`.trim());
  return parts.join(" · ");
}

export function MediaLightbox({
  assets,
  index,
  onClose,
  onIndexChange,
  onDelete,
}: {
  assets: Asset[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onDelete?: (asset: Asset) => void;
}) {
  const [actualSize, setActualSize] = useState(false);
  const [measured, setMeasured] = useState<Record<string, { width?: number; height?: number; durationMs?: number }>>({});
  const asset = assets[index];

  const step = useCallback(
    (delta: number) => {
      if (assets.length < 2) return;
      setActualSize(false);
      onIndexChange((index + delta + assets.length) % assets.length);
    },
    [assets.length, index, onIndexChange],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    // the page behind must not scroll while this is open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, step]);

  if (!asset) return null;
  const playable = asset.mimeType.startsWith("video/");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${asset.name}`}
      className="fixed inset-0 z-[60] flex flex-col bg-ink-950/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <header
        className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{asset.name}</p>
          <p className="truncate text-[11px] text-mist-400">{details({ ...asset, ...(measured[asset.id] ?? {}) })}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {assets.length > 1 && (
            <span className="mr-2 text-[11px] text-mist-400">
              {index + 1} / {assets.length}
            </span>
          )}
          {asset.kind === "IMAGE" && (
            <button
              onClick={() => setActualSize((value) => !value)}
              className="rounded-lg p-2 text-mist-400 transition hover:bg-white/5 hover:text-white"
              title={actualSize ? "Fit to screen" : "Actual size"}
            >
              {actualSize ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg p-2 text-mist-400 transition hover:bg-white/5 hover:text-white"
            title="Open the file in a new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={asset.url}
            download={asset.name}
            className="rounded-lg p-2 text-mist-400 transition hover:bg-white/5 hover:text-white"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          {onDelete && (
            <button
              onClick={() => onDelete(asset)}
              className="rounded-lg p-2 text-mist-400 transition hover:bg-white/5 hover:text-rose-400"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-1 rounded-lg p-2 text-mist-400 transition hover:bg-white/5 hover:text-white"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {assets.length > 1 && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
            className="absolute left-3 z-10 rounded-full border border-white/10 bg-ink-900/80 p-2.5 text-mist-300 transition hover:border-white/25 hover:text-white"
            title="Previous (←)"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div
          className={clsx("flex max-h-full max-w-full items-center justify-center", actualSize && "overflow-auto")}
          onClick={(event) => event.stopPropagation()}
        >
          {asset.kind === "AUDIO" ? (
            <div className="panel w-[min(560px,90vw)] p-6 text-center">
              <p className="mb-4 text-sm text-mist-200">{asset.name}</p>
              <audio
                src={asset.url}
                controls
                autoPlay
                className="w-full"
                onLoadedMetadata={(event) => {
                  const found = reportMetadata(asset, event.currentTarget);
                  if (found) setMeasured((prev) => ({ ...prev, [asset.id]: found }));
                }}
              />
            </div>
          ) : asset.kind === "VIDEO" && playable ? (
            <video
              src={asset.url}
              className="max-h-[calc(100vh-140px)] max-w-full rounded-xl"
              controls
              autoPlay
              loop
              muted
              playsInline
              onLoadedMetadata={(event) => {
                const found = reportMetadata(asset, event.currentTarget);
                if (found) setMeasured((prev) => ({ ...prev, [asset.id]: found }));
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.url}
              alt={asset.name}
              className={clsx(
                "rounded-xl",
                actualSize ? "max-w-none" : "max-h-[calc(100vh-140px)] max-w-full object-contain",
              )}
            />
          )}
        </div>

        {assets.length > 1 && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
            className="absolute right-3 z-10 rounded-full border border-white/10 bg-ink-900/80 p-2.5 text-mist-300 transition hover:border-white/25 hover:text-white"
            title="Next (→)"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {assets.length > 1 && (
        <div
          className="flex shrink-0 justify-center gap-2 overflow-x-auto border-t border-white/8 px-4 py-3"
          onClick={(event) => event.stopPropagation()}
        >
          {assets.map((item, position) => (
            <button
              key={item.id}
              onClick={() => {
                setActualSize(false);
                onIndexChange(position);
              }}
              className={clsx(
                "h-12 w-12 shrink-0 overflow-hidden rounded-lg border transition",
                position === index ? "border-accent-400" : "border-white/10 opacity-60 hover:opacity-100",
              )}
              title={item.name}
            >
              {item.kind === "AUDIO" ? (
                <span className="flex h-full w-full items-center justify-center bg-ink-850 text-[9px] text-mist-400">
                  wav
                </span>
              ) : item.mimeType.startsWith("video/") ? (
                <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
