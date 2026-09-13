import { Workstation } from "@/components/Workstation";

export default async function WorkstationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Workstation projectId={id} />;
}
