"use client";

import { useState } from "react";
import clsx from "clsx";
import { formatMoney } from "@/lib/pricing/estimate";

interface Month {
  month: string;
  label: string;
  amount: number;
  jobs: number;
}

/**
 * Spend per month: one measure over time, so one hue and no legend — the title
 * names the series. The newest bar is outlined rather than recoloured, because
 * "still filling up" is a state, not another category.
 */
export function MonthlyBars({ months, currency }: { months: Month[]; currency: string }) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...months.map((m) => m.amount), 0.0001);
  const ticks = [1, 0.75, 0.5, 0.25].map((fraction) => ({ fraction, value: max * fraction }));
  const peak = months.reduce((best, month) => (month.amount > best.amount ? month : best), months[0]);

  return (
    <section className="panel p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-white">Spend per month</h2>
          <p className="mt-0.5 text-[11px] text-mist-400">Billed generations only, by the month they ran.</p>
        </div>
        <button
          onClick={() => setAsTable((value) => !value)}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-mist-400 transition hover:text-white"
        >
          {asTable ? "Chart" : "Table"}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-mist-400">
            <tr>
              <th className="pb-2 font-medium">Month</th>
              <th className="pb-2 text-right font-medium">Generations</th>
              <th className="pb-2 text-right font-medium">Spend</th>
            </tr>
          </thead>
          <tbody className="text-mist-200">
            {months.map((month) => (
              <tr key={month.month} className="border-t border-white/5">
                <td className="py-1.5">{month.label}</td>
                <td className="py-1.5 text-right text-mist-400">{month.jobs}</td>
                <td className="py-1.5 text-right font-medium">{formatMoney(month.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative pl-12">
          <div className="absolute inset-y-0 left-0 right-0">
            {ticks.map((tick) => (
              <div
                key={tick.fraction}
                className="absolute left-0 right-0 border-t border-white/[0.06]"
                style={{ top: `${(1 - tick.fraction) * 82}%` }}
              >
                <span className="absolute -top-2 left-0 text-[10px] text-mist-400">
                  {formatMoney(tick.value, currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="relative flex h-52 items-end gap-[2px]">
            {months.map((month, index) => {
              const isCurrent = index === months.length - 1;
              const height = (month.amount / max) * 82;
              return (
                <div key={month.month} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div
                    className={clsx(
                      "w-full rounded-t-[4px] transition group-hover:bg-accent-400",
                      isCurrent
                        ? "border border-b-0 border-dashed border-accent-400 bg-accent-400/25"
                        : "bg-accent-400/80",
                    )}
                    style={{ height: `${month.amount > 0 ? Math.max(2, height) : 0}%` }}
                  />
                  {(month === peak || isCurrent) && month.amount > 0 && (
                    <span
                      className="pointer-events-none absolute inset-x-0 text-center text-[10px] font-medium text-mist-200"
                      style={{ bottom: `calc(${Math.max(2, height)}% + 4px)` }}
                    >
                      {formatMoney(month.amount, currency)}
                    </span>
                  )}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-[11px] shadow-xl group-hover:block">
                    <span className="block font-medium text-white">{month.label}</span>
                    <span className="block text-mist-300">{formatMoney(month.amount, currency)}</span>
                    <span className="block text-mist-400">{month.jobs} generations</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex gap-[2px]">
            {months.map((month) => (
              <span key={month.month} className="flex-1 truncate text-center text-[9px] text-mist-400">
                {month.label.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
