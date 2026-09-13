import { prisma } from "@/lib/db";
import { FlowEditor } from "@/components/flow/FlowEditor";
import type { Workflow } from "@/lib/client/types";

export const dynamic = "force-dynamic";

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // a project always has a canvas to open, even if it was created before flows existed
  const existing = await prisma.workflow.findFirst({ where: { projectId: id }, orderBy: { updatedAt: "desc" } });
  const workflow = existing ?? (await prisma.workflow.create({ data: { projectId: id, name: "Main flow" } }));

  return <FlowEditor projectId={id} workflow={workflow as unknown as Workflow} />;
}
