import Link from "next/link";
import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import { NewProjectButton } from "@/components/NewProjectButton";
import { ArrowUpRight, Clapperboard, Image as ImageIcon, Layers, Waves } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { assets: true, jobs: true, workflows: true } } },
  });

  const covers = await prisma.asset.findMany({
    where: { projectId: { in: projects.map((p) => p.id) }, kind: "IMAGE" },
    orderBy: { createdAt: "desc" },
    distinct: ["projectId"],
    select: { projectId: true, storageKey: true },
  });
  const coverByProject = new Map(covers.map((c) => [c.projectId, mediaUrl(c.storageKey)]));

  const totals = await prisma.asset.groupBy({ by: ["kind"], _count: { _all: true } });
  const countOf = (kind: string) => totals.find((t) => t.kind === kind)?._count._all ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-10 lg:px-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-mist-400">Workspace</p>
          <h1 className="text-4xl font-semibold tracking-tight text-white">
            Your <span className="text-gradient">studio</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-mist-400">
            Images, video, voice and dubbing in one place. Every project keeps its own assets, generations and node
            flows.
          </p>
        </div>
        <NewProjectButton />
      </header>

      <section className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Projects", value: projects.length, icon: Layers },
          { label: "Images", value: countOf("IMAGE"), icon: ImageIcon },
          { label: "Videos", value: countOf("VIDEO"), icon: Clapperboard },
          { label: "Audio", value: countOf("AUDIO"), icon: Waves },
        ].map((stat) => (
          <div key={stat.label} className="panel p-4">
            <stat.icon className="mb-3 h-5 w-5 text-accent-400" />
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
            <p className="text-xs text-mist-400">{stat.label}</p>
          </div>
        ))}
      </section>

      {projects.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center px-6 py-20 text-center">
          <span className="accent-gradient mb-5 flex h-14 w-14 items-center justify-center rounded-2xl">
            <Layers className="h-7 w-7 text-white" />
          </span>
          <h2 className="text-lg font-medium text-white">No projects yet</h2>
          <p className="mt-2 max-w-sm text-sm text-mist-400">
            A project is a workspace: a prompt workstation, an asset library and a node canvas that share the same
            media.
          </p>
          <div className="mt-6">
            <NewProjectButton />
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const cover = coverByProject.get(project.id);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="panel panel-hover group overflow-hidden"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-ink-850">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                  ) : (
                    <div className="accent-gradient h-full w-full opacity-25" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/10 to-transparent" />
                </div>
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-medium text-white">{project.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-mist-400">
                      {project.description || "No description"}
                    </p>
                    <p className="mt-3 text-[11px] text-mist-400">
                      {project._count.assets} assets · {project._count.jobs} generations · {project._count.workflows} flows
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-mist-400 transition group-hover:text-accent-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
