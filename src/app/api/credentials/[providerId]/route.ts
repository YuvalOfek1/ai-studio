import { route } from "@/lib/api";
import { credentialStatuses, deleteCredential } from "@/lib/providers/credentials";

export async function DELETE(_request: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return route(async () => {
    await deleteCredential(providerId);
    return { credentials: await credentialStatuses() };
  });
}
