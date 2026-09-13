import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { PROVIDERS } from "@/lib/providers/registry";
import { resolveRates } from "@/lib/pricing/server";
import { DEFAULT_RATES, rateKey } from "@/lib/pricing/rates";

const saveSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  unit: z.enum(["call", "image", "second", "minute", "character"]),
  amount: z.number().min(0),
  note: z.string().max(300).optional(),
});

/** Every model with the rate currently in force, and whether it is a default. */
export async function GET() {
  return route(async () => {
    const rates = await resolveRates();
    const overrides = new Set((await prisma.pricingRate.findMany()).map((r) => rateKey(r.providerId, r.modelId)));
    return {
      rates: PROVIDERS.flatMap((provider) =>
        provider.models.map((model) => {
          const key = rateKey(provider.id, model.id);
          const rate = rates[key];
          return {
            providerId: provider.id,
            providerLabel: provider.label,
            modelId: model.id,
            modelLabel: model.label,
            capability: model.capability,
            unit: rate?.unit ?? "call",
            amount: rate?.amount ?? 0,
            note: rate?.note ?? null,
            overridden: overrides.has(key),
            defaultAmount: DEFAULT_RATES[key]?.amount ?? null,
          };
        }),
      ),
    };
  });
}

export async function POST(request: Request) {
  return route(async () => {
    const body = saveSchema.parse(await request.json());
    await prisma.pricingRate.upsert({
      where: { providerId_modelId: { providerId: body.providerId, modelId: body.modelId } },
      create: body,
      update: { unit: body.unit, amount: body.amount, note: body.note },
    });
    return { saved: true };
  });
}

/** Drop an override and fall back to the shipped default. */
export async function DELETE(request: Request) {
  return route(async () => {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("providerId");
    const modelId = searchParams.get("modelId");
    if (!providerId || !modelId) throw new Error("providerId and modelId are required");
    await prisma.pricingRate.deleteMany({ where: { providerId, modelId } });
    return { deleted: true };
  });
}
