"use client";

import { useEffect, useRef, useState } from "react";
import type { Job, WorkflowRun } from "./types";

/**
 * Subscribes to /api/events for one project. The server only pushes when
 * something actually changed, so this stays quiet while nothing is generating.
 */
export function useProjectStream(projectId: string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const source = new EventSource(`/api/events?projectId=${encodeURIComponent(projectId)}`);
    sourceRef.current = source;

    source.addEventListener("state", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { jobs: Job[]; runs: WorkflowRun[] };
      setJobs(payload.jobs);
      setRuns(payload.runs);
      setConnected(true);
    });
    source.addEventListener("ping", () => setConnected(true));
    source.onerror = () => setConnected(false);

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [projectId]);

  return { jobs, runs, connected };
}
