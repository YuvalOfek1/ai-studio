"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { post } from "@/lib/client/api";
import type { Project } from "@/lib/client/types";

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { project } = await post<{ project: Project }>("/api/projects", {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="accent-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-900/30 transition hover:brightness-110"
      >
        <Plus className="h-4 w-4" />
        New project
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6">
            <h2 className="text-lg font-medium text-white">New project</h2>
            <p className="mt-1 text-xs text-mist-400">Give it a name; everything else is editable later.</p>

            <label className="mt-5 block text-xs font-medium text-mist-300">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Perfume campaign"
              className="mt-1.5"
            />

            <label className="mt-4 block text-xs font-medium text-mist-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="30s vertical spot, moody, with a Hebrew voice over"
              className="mt-1.5"
            />

            {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 text-sm text-mist-300 transition hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={busy || !name.trim()}
                className="accent-gradient rounded-xl px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
