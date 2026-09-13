import { prisma } from "../db";
import { costFor, type ActualUsage, type CostBreakdown } from "./estimate";
import { DEFAULT_RATES, rateKey, type ModelRate, type RateUnit } from "./rates";

/**
 * Server-side view of pricing: the shipped defaults with any overrides you saved
 * from the Spend page layered on top.
 */
export async function resolveRates(): Promise<Record<string, ModelRate>> {
  const overrides = await prisma.pricingRate.findMany();
  const rates: Record<string, ModelRate> = { ...DEFAULT_RATES };
  for (const override of overrides) {
    const key = rateKey(override.providerId, override.modelId);
    rates[key] = {
      ...(rates[key] ?? {}),
      unit: override.unit as RateUnit,
      amount: override.amount,
      note: override.note ?? rates[key]?.note,
    };
  }
  return rates;
}

export async function costForJob(
  providerId: string,
  modelId: string,
  params: Record<string, unknown>,
  actual?: ActualUsage,
): Promise<CostBreakdown | null> {
  return costFor(providerId, modelId, params, { rates: await resolveRates(), actual });
}

/** Columns to write on a Job row for a computed cost. */
export function costColumns(cost: CostBreakdown | null) {
  if (!cost) return {};
  return {
    costAmount: cost.amount,
    costCurrency: cost.currency,
    costUnit: cost.unit,
    costQuantity: cost.quantity,
    costRate: cost.rate,
    costEstimated: cost.estimated,
  };
}

/**
 * What the finished job actually consumed. Estimates guess 5s of video or a
 * one minute dub; this replaces the guess with what came back.
 */
export function usageFromAssets(
  assets: { kind: string; durationMs: number | null; meta: unknown }[],
  params: Record<string, unknown>,
): ActualUsage {
  const usage: ActualUsage = {};
  const images = assets.filter((a) => a.kind === "IMAGE").length;
  if (images) usage.images = images;

  const videoSeconds = assets
    .filter((a) => a.kind === "VIDEO")
    .reduce((total, asset) => {
      const meta = (asset.meta ?? {}) as { durationSeconds?: number };
      const seconds = meta.durationSeconds ?? (asset.durationMs ? asset.durationMs / 1000 : 0);
      return total + (seconds || 0);
    }, 0);
  if (videoSeconds) usage.seconds = videoSeconds;

  const audioMs = assets.filter((a) => a.kind === "AUDIO").reduce((total, a) => total + (a.durationMs ?? 0), 0);
  if (audioMs) usage.minutes = audioMs / 60_000;

  const text = params.text ?? params.prompt;
  if (typeof text === "string" && text.length) usage.characters = text.length;

  return usage;
}
