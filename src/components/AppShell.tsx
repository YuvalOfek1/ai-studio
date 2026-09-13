"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, KeyRound, LayoutGrid, Sparkles, Wallet } from "lucide-react";
import { SpendWidget } from "./SpendWidget";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Projects", icon: LayoutGrid, match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/voices", label: "Voices", icon: AudioLines, match: (p: string) => p.startsWith("/voices") },
  { href: "/spend", label: "Spend", icon: Wallet, match: (p: string) => p.startsWith("/spend") },
  { href: "/settings", label: "Providers", icon: KeyRound, match: (p: string) => p.startsWith("/settings") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-white/5 px-4 py-6 md:flex">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <span className="accent-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-lg shadow-indigo-900/40">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight text-white">AI Studio</span>
            <span className="block text-[11px] text-mist-400">direct model access</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  active ? "bg-white/10 text-white" : "text-mist-400 hover:bg-white/5 hover:text-mist-200",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <p className="px-1 text-[11px] leading-relaxed text-mist-400">
            Runs locally. Keys are encrypted in your own Postgres and used only to call vendors directly — no
            middleman, no markup.
          </p>
          <SpendWidget />
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
