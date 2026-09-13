import { z } from "zod";
import { route } from "@/lib/api";
import { credentialStatuses, saveCredential } from "@/lib/providers/credentials";

const saveSchema = z.object({
  providerId: z.string(),
  secret: z.string().min(1),
  meta: z.record(z.string(), z.string()).default({}),
});

export async function GET() {
  return route(async () => ({ credentials: await credentialStatuses() }));
}

export async function POST(request: Request) {
  return route(async () => {
    const body = saveSchema.parse(await request.json());
    await saveCredential(body.providerId, body.secret, body.meta);
    return { credentials: await credentialStatuses() };
  });
}
