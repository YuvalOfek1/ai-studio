"use client";

import clsx from "clsx";
import { AudioLines, FileVideo } from "lucide-react";
import type { Asset } from "@/lib/client/types";

/**
 * Renders whatever a provider returned. SVG "video" (what the offline mock
 * produces) is shown as an image, since no browser will play it in <video>.
 */
export function MediaPreview({
  asset,
  className,
  controls = true,
}: {
  asset: Pick<Asset, "url" | "kind" | "mimeType" | "name">;
  className?: string;
  controls?: boolean;
}) {
  const playable = asset.mimeType.startsWith("video/");

  if (asset.kind === "AUDIO") {
    return (
      <div className={clsx("flex flex-col justify-center gap-3 bg-ink-850 p-4", className)}>
        <div className="flex items-center gap-2 text-xs text-mist-300">
          <AudioLines className="h-4 w-4 text-emerald-400" />
          <span className="truncate">{asset.name}</span>
        </div>
        {controls && <audio src={asset.url} controls className="w-full" />}
      </div>
    );
  }

  if (asset.kind === "VIDEO" && playable) {
    return (
      <video
        src={asset.url}
        className={clsx("h-full w-full bg-ink-850 object-cover", className)}
        controls={controls}
        loop
        muted
        playsInline
      />
    );
  }

  return (
    <div className={clsx("relative h-full w-full bg-ink-850", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
      {asset.kind === "VIDEO" && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-ink-950/80 px-2 py-1 text-[10px] text-mist-300">
          <FileVideo className="h-3 w-3" /> mock clip
        </span>
      )}
    </div>
  );
}
