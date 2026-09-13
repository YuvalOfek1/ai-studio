import { route } from "@/lib/api";
import { spendSummary, spendPulse } from "@/lib/spend";

export const dynamic = "force-dynamic";

/** ?pulse=1 returns only the corner-widget numbers. */
export async function GET(request: Request) {
  return route(async () => {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("pulse")) return spendPulse();
    return spendSummary({
      projectId: searchParams.get("projectId") ?? undefined,
      months: searchParams.get("months") ? Number(searchParams.get("months")) : undefined,
    });
  });
}
