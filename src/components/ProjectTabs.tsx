"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Images, Sparkles, Workflow } from "lucide-react";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: "Workstation", icon: Sparkles },
    { href: `${base}/flow`, label: "Flow", icon: Workflow },
    { href: `${base}/library`, label: "Library", icon: Images },
  ];

  return (
    <nav className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
      {tabs.map((tab) => {
        const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
              active ? "bg-white/10 text-white" : "text-mist-400 hover:text-mist-200",
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
