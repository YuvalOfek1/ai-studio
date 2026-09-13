import { ProviderSettings } from "@/components/ProviderSettings";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-10 lg:px-10">
      <header className="mb-8">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-mist-400">Configuration</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Providers</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-400">
          Every model is called directly with your own key, so you pay the vendor&apos;s list price and nothing on top.
          Keys are encrypted with <code className="rounded bg-white/8 px-1 py-0.5 text-[11px]">APP_SECRET</code> before
          they touch the database.
        </p>
      </header>
      <ProviderSettings />
    </div>
  );
}
