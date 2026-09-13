"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronUp, Loader2, Wallet } from "lucide-react";
import { get } from "@/lib/client/api";
import { formatMoney } from "@/lib/pricing/estimate";

interface Pulse {
  currency: string;
  today: number;
  thisMonth: number;
  allTime: number;
  inFlight: number;
  session: { amount: number; jobs: number; startedAt: string } | null;
}

/**
 * The always-on spend readout in the bottom corner: this month at a glance,
 * with today, the current sitting and anything still running one click away.
 */
export function SpendWidget() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      get<Pulse>("/api/spend?pulse=1")
        .then((data) => alive && setPulse(data))
        .catch(() => undefined);
    load();
    const interval = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const rows = pulse
    ? [
        { label: "Today", value: pulse.today },
        { label: "This month", value: pulse.thisMonth },
        { label: "All time", value: pulse.allTime },
        ...(pulse.session ? [{ label: `This session · ${pulse.session.jobs} jobs`, value: pulse.session.amount }] : []),
      ]
    : [];

  return (
    <div className="fixed bottom-3 left-3 z-40 w-[212px] md:static md:w-auto">
      <div className="panel overflow-hidden">
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
        >
          <Wallet className="h-4 w-4 shrink-0 text-accent-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-mist-400">Spend this month</span>
            <span className="block truncate text-[15px] font-semibold text-white">
              {pulse ? formatMoney(pulse.thisMonth, pulse.currency) : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </span>
          </span>
          <ChevronUp className={clsx("h-3.5 w-3.5 shrink-0 text-mist-400 transition", open && "rotate-180")} />
        </button>

        {open && pulse && (
          <div className="border-t border-white/8 px-3 py-2.5">
            <dl className="space-y-1.5">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-2">
                  <dt className="truncate text-[11px] text-mist-400">{row.label}</dt>
                  <dd className="shrink-0 text-[11px] font-medium text-mist-200">
                    {formatMoney(row.value, pulse.currency)}
                  </dd>
                </div>
              ))}
            </dl>

            {pulse.inFlight > 0 && (
              <p className="mt-2 rounded-lg bg-indigo-500/10 px-2 py-1.5 text-[10px] text-indigo-200">
                {formatMoney(pulse.inFlight, pulse.currency)} still running
              </p>
            )}

            <Link
              href="/spend"
              className="mt-2.5 block rounded-lg border border-white/10 py-1.5 text-center text-[11px] text-mist-300 transition hover:border-accent-400/50 hover:text-white"
            >
              Full breakdown
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
