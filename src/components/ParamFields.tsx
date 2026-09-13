"use client";

import Link from "next/link";
import type { Field } from "@/lib/providers/types";
import type { Voice } from "@/lib/client/types";
import { AssetSlot } from "./AssetPicker";

/** Renders a provider's parameter schema. One switch, every model. */
export function ParamFields({
  fields,
  values,
  onChange,
  projectId,
  voices,
  compact = false,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  projectId: string;
  voices: Voice[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {fields.map((field) => {
        const value = values[field.key] ?? field.default ?? "";

        if (field.type === "image" || field.type === "video" || field.type === "audio") {
          return (
            <AssetSlot
              key={field.key}
              projectId={projectId}
              kind={field.type.toUpperCase() as "IMAGE" | "VIDEO" | "AUDIO"}
              label={field.required ? `${field.label} *` : field.label}
              value={typeof value === "string" ? value : undefined}
              onChange={(assetId) => onChange(field.key, assetId)}
              compact={compact}
            />
          );
        }

        if (field.type === "voice") {
          return (
            <div key={field.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-mist-300">
                  {field.label}
                  {field.required && " *"}
                </label>
                <Link href="/voices" className="text-[11px] text-accent-400 hover:underline">
                  manage voices
                </Link>
              </div>
              <select value={String(value)} onChange={(e) => onChange(field.key, e.target.value)}>
                <option value="">Select a voice…</option>
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.providerVoiceId}>
                    {voice.name} · {voice.providerId}
                  </option>
                ))}
              </select>
              {voices.length === 0 && (
                <p className="mt-1 text-[11px] text-mist-400">
                  No voices yet — clone one from an mp3 or sync your provider account on the Voices page.
                </p>
              )}
            </div>
          );
        }

        if (field.type === "boolean") {
          return (
            <label key={field.key} className="flex cursor-pointer items-center gap-3 text-xs text-mist-300">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => onChange(field.key, e.target.checked)}
                className="h-4 w-4 shrink-0 accent-indigo-500"
                style={{ width: "1rem" }}
              />
              <span>
                {field.label}
                {field.help && <span className="block text-[11px] text-mist-400">{field.help}</span>}
              </span>
            </label>
          );
        }

        return (
          <div key={field.key}>
            <label className="mb-1.5 block text-xs font-medium text-mist-300">
              {field.label}
              {field.required && " *"}
            </label>

            {field.type === "textarea" ? (
              <textarea
                rows={compact ? 3 : 4}
                value={String(value)}
                placeholder={field.placeholder}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            ) : field.type === "select" ? (
              <select value={String(value)} onChange={(e) => onChange(field.key, e.target.value)}>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "number" ? (
              <input
                type="number"
                value={String(value)}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(e) => onChange(field.key, e.target.value === "" ? "" : Number(e.target.value))}
              />
            ) : (
              <input
                type="text"
                value={String(value)}
                placeholder={field.placeholder}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}

            {field.help && <p className="mt-1 text-[11px] text-mist-400">{field.help}</p>}
          </div>
        );
      })}
    </div>
  );
}
