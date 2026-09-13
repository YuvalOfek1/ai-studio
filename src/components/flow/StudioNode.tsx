"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import clsx from "clsx";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { PORT_COLORS, type FlowNodeData, type Port } from "@/lib/engine/nodes";

const KIND_ACCENT: Record<string, string> = {
  text: "from-slate-500/70 to-slate-400/50",
  asset: "from-indigo-500/80 to-indigo-400/50",
  voice: "from-amber-500/80 to-amber-400/50",
  generate: "from-indigo-500/80 to-pink-500/60",
  output: "from-emerald-500/80 to-emerald-400/50",
};

const STATUS_ICON = {
  QUEUED: Loader2,
  RUNNING: Loader2,
  SUCCEEDED: CheckCircle2,
  FAILED: AlertCircle,
  CANCELED: AlertCircle,
} as const;

export interface StudioNodeData extends FlowNodeData {
  ports: { inputs: Port[]; outputs: Port[] };
  status?: keyof typeof STATUS_ICON;
  previewUrl?: string;
  previewKind?: "IMAGE" | "VIDEO" | "AUDIO";
}

/** A single node on the canvas: header, body summary, typed handles down each side. */
export function StudioNode({ data, selected }: NodeProps) {
  const node = data as unknown as StudioNodeData;
  const ports = node.ports ?? { inputs: [], outputs: [] };
  const StatusIcon = node.status ? STATUS_ICON[node.status] : null;
  const rows = Array.from({ length: Math.max(ports.inputs.length, ports.outputs.length) }, (_, index) => ({
    input: ports.inputs[index],
    output: ports.outputs[index],
  }));

  return (
    <div
      className={clsx(
        "w-[264px] overflow-hidden rounded-2xl border bg-ink-850/95 shadow-xl shadow-black/40 backdrop-blur transition",
        selected ? "border-accent-400" : "border-white/10",
      )}
    >
      <div className={clsx("bg-gradient-to-r px-3 py-2.5", KIND_ACCENT[node.kind] ?? KIND_ACCENT.generate)}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-white">
            {node.label ?? node.kind}
          </span>
          {StatusIcon && (
            <StatusIcon
              className={clsx(
                "h-3.5 w-3.5 shrink-0",
                node.status === "RUNNING" || node.status === "QUEUED" ? "animate-spin text-white" : "",
                node.status === "SUCCEEDED" && "text-emerald-200",
                node.status === "FAILED" && "text-rose-200",
              )}
            />
          )}
        </div>
        <span className="mt-0.5 block truncate text-[10px] text-white/70">
          {node.kind === "generate" ? `${node.providerId ?? "—"} · ${node.modelId ?? "pick a model"}` : node.kind}
        </span>
      </div>

      <div className="min-h-[52px] px-3 py-2.5">
        {node.kind === "text" && (
          <p className="line-clamp-3 text-[11px] leading-relaxed text-mist-300">
            {node.text || <span className="text-mist-400">Empty — type a prompt in the inspector.</span>}
          </p>
        )}

        {node.kind === "asset" &&
          (node.previewUrl ? (
            node.previewKind === "AUDIO" ? (
              <p className="text-[11px] text-mist-300">Audio selected</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={node.previewUrl} alt="" className="h-20 w-full rounded-lg object-cover" />
            )
          ) : (
            <p className="text-[11px] text-mist-400">No asset selected</p>
          ))}

        {node.kind === "voice" && (
          <p className="text-[11px] text-mist-300">{node.voiceName ?? <span className="text-mist-400">No voice selected</span>}</p>
        )}

        {node.kind === "generate" && (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-mist-400">
            {String(node.params?.prompt ?? node.params?.text ?? "") || "Wire inputs or set parameters"}
          </p>
        )}

        {node.kind === "output" &&
          (node.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.previewUrl} alt="" className="h-20 w-full rounded-lg object-cover" />
          ) : (
            <p className="text-[11px] text-mist-400">Final result lands here</p>
          ))}
      </div>

      {/* one row per port: the handle sits inside the row, so labels can never overlap */}
      {rows.length > 0 && (
        <div className="border-t border-white/8 py-1.5">
          {rows.map((row, index) => (
            <div key={index} className="relative flex h-[22px] items-center justify-between px-3">
              {row.input ? (
                <>
                  <Handle
                    id={row.input.id}
                    type="target"
                    position={Position.Left}
                    style={{ left: -6, top: "50%", background: PORT_COLORS[row.input.type] }}
                  />
                  <span className="text-[10px] text-mist-400">
                    {row.input.label}
                    {row.input.required && <span className="text-rose-400"> *</span>}
                  </span>
                </>
              ) : (
                <span />
              )}

              {row.output && (
                <>
                  <span className="text-[10px] text-mist-400">{row.output.label}</span>
                  <Handle
                    id={row.output.id}
                    type="source"
                    position={Position.Right}
                    style={{ right: -6, top: "50%", background: PORT_COLORS[row.output.type] }}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
