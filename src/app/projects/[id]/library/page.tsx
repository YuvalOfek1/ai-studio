import { AssetLibrary } from "@/components/AssetLibrary";

export default async function LibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssetLibrary projectId={id} />;
}
