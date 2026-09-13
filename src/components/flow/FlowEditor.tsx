"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import clsx from "clsx";
import { Loader2, Play, Save, Trash2 } from "lucide-react";
import { get, patch, post } from "@/lib/client/api";
import type { Catalog, Voice, Workflow } from "@/lib/client/types";
import { PORT_COLORS, SOURCE_NODES, type FlowNodeData, type Port } from "@/lib/engine/nodes";
import { useProjectStream } from "@/lib/client/useProjectStream";
import { ParamFields } from "@/components/ParamFields";
import { AssetSlot } from "@/components/AssetPicker";
import { StudioNode, type StudioNodeData } from "./StudioNode";
import { StudioEdge } from "./StudioEdge";
import { computePorts, findModel } from "./ports";

const nodeTypes = { studio: StudioNode };
const edgeTypes = { studio: StudioEdge };

let nodeCounter = 0;
const nextId = () => `n${Date.now().toString(36)}${(nodeCounter++).toString(36)}`;

interface DragPayload {
  kind: FlowNodeData["kind"];
  label: string;
  capability?: string;
  providerId?: string;
  modelId?: string;
}

function Canvas({ projectId, workflow }: { projectId: string; workflow: Workflow }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    ((workflow.graph?.nodes ?? []) as Node[]).map((node) => ({ ...node, type: "studio" })),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    ((workflow.graph?.edges ?? []) as Edge[]).map((edge) => ({ ...edge, type: "studio", reconnectable: true })),
  );
  const [name, setName] = useState(workflow.name);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { runs } = useProjectStream(projectId);

  useEffect(() => {
    get<Catalog>("/api/catalog").then(setCatalog);
    get<{ voices: Voice[] }>("/api/voices").then((d) => setVoices(d.voices));
  }, []);

  // recompute ports whenever the catalog arrives or a node's model changes
  useEffect(() => {
    if (!catalog) return;
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...node.data, ports: computePorts(node.data as unknown as FlowNodeData, catalog) },
      })),
    );
  }, [catalog, setNodes]);

  const run = runs.find((r) => r.id === activeRunId) ?? runs.find((r) => r.workflowId === workflow.id);

  // paint live job status onto the nodes of the running flow
  useEffect(() => {
    if (!run) return;
    const statusByNode = new Map(run.jobs.filter((j) => j.nodeId).map((j) => [j.nodeId!, j.status]));
    setNodes((current) =>
      current.map((node) => {
        const status = statusByNode.get(node.id);
        if ((node.data as StudioNodeData).status === status) return node;
        return { ...node, data: { ...node.data, status } };
      }),
    );
    if (run.status === "SUCCEEDED" || run.status === "FAILED") {
      setRunning(false);
      if (run.error) setError(run.error);
      get<{ run: { jobs: { nodeId: string | null; assets: { url: string; kind: string }[] }[] } }>(`/api/runs/${run.id}`).then(
        ({ run: detail }) => {
          const previews = new Map(
            detail.jobs
              .filter((job) => job.nodeId && job.assets.length)
              .map((job) => [job.nodeId!, job.assets[0]]),
          );
          setNodes((current) =>
            current.map((node) => {
              const preview = previews.get(node.id);
              return preview
                ? { ...node, data: { ...node.data, previewUrl: preview.url, previewKind: preview.kind } }
                : node;
            }),
          );
        },
      );
    }
  }, [run, setNodes]);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedData = (selected?.data ?? null) as StudioNodeData | null;

  const updateSelected = useCallback(
    (changes: Partial<StudioNodeData>) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== selectedId) return node;
          const data = { ...(node.data as StudioNodeData), ...changes } as StudioNodeData;
          return { ...node, data: { ...data, ports: computePorts(data, catalog) } };
        }),
      );
    },
    [selectedId, setNodes, catalog],
  );

  const addNode = useCallback(
    (payload: DragPayload, position: { x: number; y: number }) => {
      const data: FlowNodeData = {
        kind: payload.kind,
        label: payload.label,
        capability: payload.capability as FlowNodeData["capability"],
        providerId: payload.providerId,
        modelId: payload.modelId,
        params: {},
        assetKind: payload.kind === "asset" ? "IMAGE" : undefined,
      };
      const node: Node = {
        id: nextId(),
        type: "studio",
        position,
        data: { ...data, ports: computePorts(data, catalog) } as unknown as Record<string, unknown>,
      };
      setNodes((current) => [...current, node]);
      setSelectedId(node.id);
    },
    [catalog, setNodes],
  );

  const portType = useCallback(
    (nodeId: string, handleId: string | null | undefined, side: "inputs" | "outputs"): Port["type"] | undefined => {
      const node = nodes.find((n) => n.id === nodeId);
      const ports = (node?.data as StudioNodeData | undefined)?.ports?.[side] ?? [];
      return (ports.find((p) => p.id === (handleId ?? ports[0]?.id)) ?? ports[0])?.type;
    },
    [nodes],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return false;
      const targetNode = nodes.find((n) => n.id === connection.target);
      // the output node is a sink: it accepts anything
      if ((targetNode?.data as StudioNodeData | undefined)?.kind === "output") return true;
      const from = portType(connection.source, connection.sourceHandle, "outputs");
      const to = portType(connection.target, connection.targetHandle, "inputs");
      return Boolean(from && to && from === to);
    },
    [nodes, portType],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const type = portType(connection.source, connection.sourceHandle, "outputs") ?? "text";
      setEdges((current) => {
        // one connection per input: a port cannot take two values
        const cleaned = current.filter(
          (edge) => !(edge.target === connection.target && edge.targetHandle === connection.targetHandle),
        );
        return addEdge(
          {
            ...connection,
            type: "studio",
            animated: true,
            reconnectable: true,
            style: { stroke: PORT_COLORS[type], strokeWidth: 2 },
          },
          cleaned,
        );
      });
    },
    [portType, setEdges],
  );

  const onReconnect = useCallback(
    (previous: Edge, connection: Connection) =>
      setEdges((current) => reconnectEdge(previous, connection, current)),
    [setEdges],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await patch(`/api/workflows/${workflow.id}`, {
        name,
        graph: {
          nodes: nodes.map(({ id, position, data }) => ({
            id,
            position,
            // ports/status/previews are derived, never persisted
            data: (({ ports, status, previewUrl, previewKind, ...rest }) => rest)(data as StudioNodeData),
          })),
          edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
            id,
            source,
            target,
            sourceHandle,
            targetHandle,
          })),
        },
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function runFlow() {
    setRunning(true);
    setError(null);
    try {
      await save();
      const { run: created } = await post<{ run: { id: string } }>(`/api/workflows/${workflow.id}/run`);
      setActiveRunId(created.id);
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }

  const paletteGroups = useMemo(() => {
    if (!catalog) return [];
    return catalog.capabilities
      .filter((capability) => capability.models.length > 0)
      .map((capability) => {
        const preferred =
          capability.models.find((m) => !m.needsKey || catalog.configured.includes(m.providerId)) ?? capability.models[0];
        return {
          capability,
          payload: {
            kind: "generate" as const,
            label: capability.label,
            capability: capability.id,
            providerId: preferred.providerId,
            modelId: preferred.id,
          },
        };
      });
  }, [catalog]);

  const selectedModel = findModel(catalog, selectedData?.providerId, selectedData?.modelId);
  const wiredHandles = new Set(edges.filter((e) => e.target === selectedId).map((e) => e.targetHandle ?? "input"));

  return (
    <div className="flex h-[calc(100vh-73px)]">
      {/* palette */}
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-white/5 p-3 lg:block">
        <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-mist-400">Inputs</p>
        <div className="mb-5 space-y-1.5">
          {SOURCE_NODES.map((source) => (
            <PaletteItem
              key={source.kind}
              label={source.label}
              hint={source.description}
              payload={{ kind: source.kind, label: source.label }}
              onAdd={(payload) => addNode(payload, { x: 120, y: 120 + Math.random() * 200 })}
            />
          ))}
        </div>

        <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-mist-400">Generators</p>
        <div className="space-y-1.5">
          {paletteGroups.map(({ capability, payload }) => (
            <PaletteItem
              key={capability.id}
              label={capability.label}
              hint={capability.description}
              payload={payload}
              onAdd={(item) => addNode(item, { x: 420, y: 120 + Math.random() * 200 })}
            />
          ))}
        </div>
      </aside>

      {/* canvas */}
      <div className="relative min-w-0 flex-1" ref={wrapper}>
        <div className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center gap-3 border-b border-white/5 bg-ink-950/70 px-4 py-2.5 backdrop-blur">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-[220px] !border-transparent !bg-transparent !px-0 text-sm font-medium text-white"
          />
          <span className="hidden text-[11px] text-mist-400 lg:inline">
            Drag a port onto another to connect · click a line then press Delete, or use its ×
          </span>
          <div className="ml-auto flex items-center gap-2">
            {error && <span className="max-w-[320px] truncate text-[11px] text-rose-400">{error}</span>}
            {run && (
              <span
                className={clsx(
                  "rounded-md px-2 py-1 text-[10px] uppercase tracking-wide",
                  run.status === "SUCCEEDED" && "bg-emerald-500/10 text-emerald-300",
                  run.status === "FAILED" && "bg-rose-500/10 text-rose-300",
                  (run.status === "RUNNING" || run.status === "QUEUED") && "bg-indigo-500/10 text-indigo-300",
                )}
              >
                run {run.status.toLowerCase()}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-mist-200 transition hover:text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
            </button>
            <button
              onClick={runFlow}
              disabled={running || nodes.length === 0}
              className="accent-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run flow
            </button>
          </div>
        </div>

        <div
          className="h-full pt-[46px]"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const raw = event.dataTransfer.getData("application/studio-node");
            if (!raw) return;
            addNode(JSON.parse(raw) as DragPayload, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            deleteKeyCode={["Delete", "Backspace"]}
            connectionRadius={28}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "studio", animated: true, reconnectable: true }}
            className="bg-transparent"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.10)" />
            <Controls className="!bottom-4 !left-4 !rounded-xl !border !border-white/10 !bg-ink-850/90 !shadow-xl" />
            <MiniMap
              pannable
              zoomable
              className="!bottom-4 !right-4 !rounded-xl !border !border-white/10 !bg-ink-850/90"
              maskColor="rgba(7,7,11,0.75)"
              nodeColor={() => "#6366f1"}
            />
          </ReactFlow>
        </div>
      </div>

      {/* inspector */}
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-white/5 p-4 xl:block">
        {!selected || !selectedData ? (
          <div className="pt-10 text-center">
            <p className="text-xs text-mist-300">Nothing selected</p>
            <p className="mx-auto mt-2 max-w-[220px] text-[11px] leading-relaxed text-mist-400">
              Drag a node from the left onto the canvas, connect the coloured ports, then hit Run flow.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-mist-400">{selectedData.kind}</p>
                <input
                  value={selectedData.label ?? ""}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="!px-0 !border-transparent !bg-transparent text-sm font-medium text-white"
                />
              </div>
              <button
                onClick={() => {
                  setNodes((current) => current.filter((n) => n.id !== selectedId));
                  setEdges((current) => current.filter((e) => e.source !== selectedId && e.target !== selectedId));
                  setSelectedId(null);
                }}
                className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/5 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {selectedData.kind === "text" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-mist-300">Text</label>
                <textarea
                  rows={6}
                  value={selectedData.text ?? ""}
                  placeholder="A prompt you can feed into several generators…"
                  onChange={(e) => updateSelected({ text: e.target.value })}
                />
              </div>
            )}

            {selectedData.kind === "asset" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-mist-300">Type</label>
                  <select
                    value={selectedData.assetKind ?? "IMAGE"}
                    onChange={(e) => updateSelected({ assetKind: e.target.value as "IMAGE", assetId: undefined })}
                  >
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                    <option value="AUDIO">Audio</option>
                  </select>
                </div>
                <AssetSlot
                  projectId={projectId}
                  kind={(selectedData.assetKind ?? "IMAGE") as "IMAGE"}
                  label="Asset"
                  value={selectedData.assetId}
                  onChange={(assetId, asset) =>
                    updateSelected({ assetId, previewUrl: asset?.url, previewKind: asset?.kind })
                  }
                />
              </div>
            )}

            {selectedData.kind === "voice" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-mist-300">Voice</label>
                <select
                  value={selectedData.voiceId ?? ""}
                  onChange={(e) => {
                    const voice = voices.find((v) => v.providerVoiceId === e.target.value);
                    updateSelected({ voiceId: e.target.value, voiceName: voice?.name });
                  }}
                >
                  <option value="">Select a voice…</option>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.providerVoiceId}>
                      {voice.name} · {voice.providerId}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedData.kind === "generate" && catalog && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-mist-300">Capability</label>
                  <select
                    value={selectedData.capability ?? ""}
                    onChange={(e) => {
                      const capability = catalog.capabilities.find((c) => c.id === e.target.value);
                      const preferred =
                        capability?.models.find((m) => !m.needsKey || catalog.configured.includes(m.providerId)) ??
                        capability?.models[0];
                      updateSelected({
                        capability: capability?.id,
                        providerId: preferred?.providerId,
                        modelId: preferred?.id,
                        label: capability?.label,
                        params: {},
                      });
                    }}
                  >
                    {catalog.capabilities.map((capability) => (
                      <option key={capability.id} value={capability.id}>
                        {capability.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-mist-300">Model</label>
                  <select
                    value={`${selectedData.providerId}:${selectedData.modelId}`}
                    onChange={(e) => {
                      const [providerId, modelId] = e.target.value.split(":");
                      updateSelected({ providerId, modelId, params: {} });
                    }}
                  >
                    {catalog.capabilities
                      .find((c) => c.id === selectedData.capability)
                      ?.models.map((option) => (
                        <option key={`${option.providerId}:${option.id}`} value={`${option.providerId}:${option.id}`}>
                          {option.providerLabel} — {option.label}
                          {option.needsKey && !catalog.configured.includes(option.providerId) ? " (no key)" : ""}
                        </option>
                      ))}
                  </select>
                </div>

                {selectedModel && (
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-mist-400">Parameters</p>
                    <ParamFields
                      compact
                      projectId={projectId}
                      voices={voices}
                      // fields fed by an edge are set at run time, so hide them here
                      fields={selectedModel.fields.filter((field) => !wiredHandles.has(field.key))}
                      values={(selectedData.params ?? {}) as Record<string, unknown>}
                      onChange={(key, value) =>
                        updateSelected({ params: { ...(selectedData.params ?? {}), [key]: value } })
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {selectedData.kind === "output" && (
              <p className="text-[11px] leading-relaxed text-mist-400">
                Anything wired in here is recorded as a deliverable of the run, and shows up in the library like any
                other asset.
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function PaletteItem({
  label,
  hint,
  payload,
  onAdd,
}: {
  label: string;
  hint: string;
  payload: DragPayload;
  onAdd: (payload: DragPayload) => void;
}) {
  return (
    <button
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/studio-node", JSON.stringify(payload));
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onAdd(payload)}
      className="w-full cursor-grab rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition hover:border-accent-400/50 hover:bg-white/[0.06] active:cursor-grabbing"
      title={hint}
    >
      <span className="block text-[12px] font-medium text-mist-200">{label}</span>
      <span className="mt-0.5 line-clamp-1 block text-[10px] text-mist-400">{hint}</span>
    </button>
  );
}

export function FlowEditor(props: { projectId: string; workflow: Workflow }) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
