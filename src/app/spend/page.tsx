import { spendSummary } from "@/lib/spend";
import { SpendDashboard } from "@/components/spend/SpendDashboard";

export const dynamic = "force-dynamic";

export default async function SpendPage() {
  const summary = await spendSummary({ months: 12 });

  return (
    <div className="mx-auto w-full max-w-[1300px] px-6 py-10 lg:px-10">
      <header className="mb-8">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-mist-400">Money</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Spend</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-400">
          What every generation cost you, by month, by model, by sitting and by project — computed from the rate table
          below, which you own and can correct at any time.
        </p>
      </header>
      <SpendDashboard summary={summary} />
    </div>
  );
}
