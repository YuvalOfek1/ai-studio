"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { del, get, post } from "@/lib/client/api";
import { formatMoney } from "@/lib/pricing/estimate";
import { UNIT_LABEL, type RateUnit } from "@/lib/pricing/rates";
import type { SpendSummary } from "@/lib/spend";
import { MonthlyBars } from "./MonthlyBars";

interface Rate {
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  capability: string;
  unit: RateUnit;
  amount: number;
  note: string | null;
  overridden: boolean;
  defaultAmount: number | null;
}

const formatWindow = (startedAt: string, endedAt: string) => {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const minutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
  const time = (date: Date) => date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time(start)}–${time(end)} · ${minutes} min`;
};

export function SpendDashboard({ summary }: { summary: SpendSummary }) {
  const { totals, currency } = summary;
  const maxModel = Math.max(...summary.byModel.map((m) => m.amount), 0.0001);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "All time", value: totals.allTime, hint: `${totals.jobs} billed generations` },
          { label: "This month", value: totals.thisMonth, hint: "calendar month to date" },
          { label: "Last 30 days", value: totals.last30Days, hint: "rolling window" },
          { label: "Today", value: totals.today, hint: "since midnight" },
        ].map((tile) => (
          <div key={tile.label} className="panel p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-mist-400">{tile.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatMoney(tile.value, currency)}</p>
            <p className="mt-1 text-[11px] text-mist-400">{tile.hint}</p>
          </div>
        ))}
      </section>

      {(totals.inFlight > 0 || totals.failed > 0 || totals.unpriced > 0) && (
        <section className="panel flex flex-wrap gap-x-8 gap-y-2 p-4 text-[11px] text-mist-400">
          {totals.inFlight > 0 && (
            <span>
              <span className="text-indigo-300">{formatMoney(totals.inFlight, currency)}</span> queued or running
              (estimated, not yet counted)
            </span>
          )}
          {totals.failed > 0 && (
            <span>
              <span className="text-rose-300">{formatMoney(totals.failed, currency)}</span> on failed or canceled jobs —
              excluded, since most vendors do not bill them
            </span>
          )}
          {totals.unpriced > 0 && (
            <span>
              {totals.unpriced} generation{totals.unpriced === 1 ? "" : "s"} with no rate on file — set one below
            </span>
          )}
        </section>
      )}

      <MonthlyBars months={summary.byMonth} currency={currency} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-sm font-medium text-white">Spend per model</h2>
          <p className="mt-0.5 mb-4 text-[11px] text-mist-400">Where the money actually goes, highest first.</p>

          {summary.byModel.length === 0 ? (
            <p className="py-8 text-center text-xs text-mist-400">Nothing billed yet.</p>
          ) : (
            <div className="space-y-3">
              {summary.byModel.map((model) => (
                <div key={`${model.providerId}:${model.modelId}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-mist-200">
                      {model.modelLabel}
                      <span className="ml-1.5 text-[10px] text-mist-400">{model.providerLabel}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-white">
                      {formatMoney(model.amount, currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-accent-400/80"
                        style={{ width: `${Math.max(2, (model.amount / maxModel) * 100)}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] text-mist-400">
                      {model.jobs}× · {model.quantity ? `${Math.round(model.quantity)} ` : ""}
                      {model.unit ? UNIT_LABEL[model.unit as RateUnit].replace("per ", "") : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {summary.byProvider.length > 0 && (
            <div className="mt-5 border-t border-white/5 pt-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-mist-400">By provider</p>
              <div className="flex flex-wrap gap-2">
                {summary.byProvider.map((provider) => (
                  <span
                    key={provider.providerId}
                    className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] text-mist-300"
                  >
                    {provider.label} <span className="text-white">{formatMoney(provider.amount, currency)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-sm font-medium text-white">Sessions</h2>
          <p className="mt-0.5 mb-4 text-[11px] text-mist-400">
            One sitting = work with no gap longer than {summary.sessionGapMinutes} minutes.
          </p>

          {summary.sessions.length === 0 ? (
            <p className="py-8 text-center text-xs text-mist-400">No sessions yet.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-ink-850 text-[10px] uppercase tracking-wide text-mist-400">
                  <tr>
                    <th className="pb-2 font-medium">When</th>
                    <th className="pb-2 text-right font-medium">Jobs</th>
                    <th className="pb-2 text-right font-medium">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.sessions.map((session) => (
                    <tr key={session.id} className="border-t border-white/5 align-top">
                      <td className="py-2 pr-3">
                        <span className="block text-mist-200">{formatWindow(session.startedAt, session.endedAt)}</span>
                        <span className="block truncate text-[10px] text-mist-400">
                          {session.projects.join(", ")} · {session.models.slice(0, 3).join(", ")}
                          {session.models.length > 3 ? ` +${session.models.length - 3}` : ""}
                        </span>
                      </td>
                      <td className="py-2 text-right text-mist-400">{session.jobs}</td>
                      <td className="py-2 text-right font-medium text-white">
                        {formatMoney(session.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {summary.byProject.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-4 text-sm font-medium text-white">Spend per project</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.byProject.map((project) => (
              <div key={project.projectId} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <p className="truncate text-xs text-mist-200">{project.name}</p>
                <p className="mt-1 text-lg font-semibold text-white">{formatMoney(project.amount, currency)}</p>
                <p className="text-[10px] text-mist-400">{project.jobs} generations</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <RateEditor />
    </div>
  );
}

/** Vendor prices move; this keeps the numbers above honest without a code change. */
function RateEditor() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; unit: RateUnit }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = () => get<{ rates: Rate[] }>("/api/rates").then((data) => setRates(data.rates));
  useEffect(() => {
    load();
  }, []);

  const key = (rate: Rate) => `${rate.providerId}:${rate.modelId}`;

  async function save(rate: Rate) {
    const draft = drafts[key(rate)];
    if (!draft) return;
    setBusy(key(rate));
    try {
      await post("/api/rates", {
        providerId: rate.providerId,
        modelId: rate.modelId,
        unit: draft.unit,
        amount: Number(draft.amount),
      });
      await load();
      setMessage(`${rate.modelLabel} rate saved — recompute to apply it to past jobs.`);
    } finally {
      setBusy(null);
    }
  }

  async function reset(rate: Rate) {
    setBusy(key(rate));
    try {
      await del(`/api/rates?providerId=${rate.providerId}&modelId=${rate.modelId}`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key(rate)];
        return next;
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function recompute() {
    setBusy("recompute");
    try {
      const result = await post<{ repriced: number }>("/api/spend/recompute");
      setMessage(`Repriced ${result.repriced} generations. Refresh to see the new totals.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-white">Rates</h2>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-mist-400">
            Costs are computed from these rates, not reported by the vendors — the defaults are public list prices at
            the time of writing, so check them against your invoice and correct anything that drifted. Changes apply to
            new generations; use recompute to apply them to history too.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={recompute}
            disabled={busy === "recompute"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-mist-300 transition hover:text-white disabled:opacity-50"
          >
            {busy === "recompute" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            Recompute history
          </button>
          <button
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-mist-300 transition hover:text-white"
          >
            {open ? "Hide" : `Edit rates (${rates.length})`}
          </button>
        </div>
      </div>

      {message && <p className="mt-3 rounded-lg bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">{message}</p>}

      {open && (
        <div className="mt-4 max-h-[460px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-ink-850 text-[10px] uppercase tracking-wide text-mist-400">
              <tr>
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium">Unit</th>
                <th className="pb-2 text-right font-medium">Rate (USD)</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => {
                const draft = drafts[key(rate)] ?? { amount: String(rate.amount), unit: rate.unit };
                const dirty = Number(draft.amount) !== rate.amount || draft.unit !== rate.unit;
                return (
                  <tr key={key(rate)} className="border-t border-white/5">
                    <td className="py-2 pr-3">
                      <span className="block text-mist-200">{rate.modelLabel}</span>
                      <span className="block text-[10px] text-mist-400">
                        {rate.providerLabel}
                        {rate.overridden && <span className="ml-1.5 text-amber-300">overridden</span>}
                        {rate.note && !rate.overridden && <span className="ml-1.5">{rate.note}</span>}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={draft.unit}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [key(rate)]: { ...draft, unit: e.target.value as RateUnit } }))
                        }
                        className="!w-[150px] !py-1 !text-[11px]"
                      >
                        {(Object.keys(UNIT_LABEL) as RateUnit[]).map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABEL[unit]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <input
                        type="number"
                        step="0.00001"
                        min="0"
                        value={draft.amount}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [key(rate)]: { ...draft, amount: e.target.value } }))
                        }
                        className="!w-[110px] !py-1 text-right !text-[11px]"
                      />
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => save(rate)}
                          disabled={!dirty || busy === key(rate)}
                          className={clsx(
                            "rounded-lg p-1.5 transition",
                            dirty ? "text-accent-400 hover:bg-white/5" : "text-mist-400 opacity-40",
                          )}
                          title="Save rate"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        {rate.overridden && (
                          <button
                            onClick={() => reset(rate)}
                            className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/5 hover:text-white"
                            title="Back to the default rate"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
