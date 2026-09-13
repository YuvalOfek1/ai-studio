import { route } from "@/lib/api";
import { catalog } from "@/lib/providers/registry";
import { configuredProviderIds } from "@/lib/providers/credentials";

/** Everything the UI needs to render model pickers and parameter forms. */
export async function GET() {
  return route(async () => {
    const data = catalog();
    const configured = await configuredProviderIds();
    return { ...data, configured };
  });
}
