"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import clsx from "clsx";
import { X } from "lucide-react";

/**
 * A connection you can actually get rid of: every edge carries a delete button at
 * its midpoint (faint until you hover or select it). Selecting an edge and pressing
 * Delete or Backspace works too, and dragging either end onto another port moves it.
 */
export function StudioEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{ ...style, strokeWidth: selected ? 3 : (style?.strokeWidth ?? 2) }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setEdges((edges) => edges.filter((edge) => edge.id !== id));
          }}
          className={clsx(
            "nodrag nopan pointer-events-auto absolute flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-ink-850 text-mist-400 shadow-lg transition",
            "hover:border-rose-400/60 hover:bg-rose-500/15 hover:text-rose-300 hover:opacity-100",
            selected ? "opacity-100" : "opacity-0 hover:opacity-100",
          )}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title="Remove this connection"
          aria-label="Remove this connection"
        >
          <X className="h-3 w-3" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
