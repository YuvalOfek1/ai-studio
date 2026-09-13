import { DEFAULT_RATES, rateKey, type ModelRate, type RateUnit } from "./rates";

/**
 * Turns a model + its parameters into money. Pure and client-safe, so the
 * workstation can show "≈ $0.28" before you press Generate and the worker can
 * record the real number afterwards using the same arithmetic.
 */

export interface CostBreakdown {
  amount: number;
  currency: "USD";
  unit: RateUnit;
  quantity: number;
  /** rate actually used, after modifiers */
  rate: number;
  estimated: boolean;
  note?: string;
}

/** What we learned from the finished job — turns an estimate into a real cost. */
export interface ActualUsage {
  images?: number;
  seconds?: number;
  minutes?: number;
  characters?: number;
}

function applyModifiers(rate: ModelRate, params: Record<string, unknown>): number {
  let amount = rate.amount;
  for (const [key, table] of Object.entries(rate.modifiers ?? {})) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    const multiplier = table[String(value)];
    if (multiplier !== undefined) amount *= multiplier;
  }
  return amount;
}

function quantityFor(unit: RateUnit, params: Record<string, unknown>, actual?: ActualUsage): number {
  switch (unit) {
    case "image":
      return actual?.images ?? (Number(params.n ?? params.sampleCount ?? 1) || 1);
    case "second":
      return actual?.seconds ?? (Number(params.duration ?? params.durationSeconds ?? 5) || 5);
    case "minute":
      return actual?.minutes ?? 1;
    case "character":
      return actual?.characters ?? String(params.text ?? params.prompt ?? "").length;
    case "call":
      return 1;
  }
}

export function costFor(
  providerId: string,
  modelId: string,
  params: Record<string, unknown>,
  options: { rates?: Record<string, ModelRate>; actual?: ActualUsage } = {},
): CostBreakdown | null {
  const rates = options.rates ?? DEFAULT_RATES;
  const rate = rates[rateKey(providerId, modelId)];
  if (!rate) return null;

  const unitRate = applyModifiers(rate, params);
  const quantity = quantityFor(rate.unit, params, options.actual);
  return {
    amount: Number((unitRate * quantity).toFixed(6)),
    currency: "USD",
    unit: rate.unit,
    quantity,
    rate: unitRate,
    estimated: !options.actual,
    note: rate.note,
  };
}

export function formatMoney(amount: number | null | undefined, currency = "USD"): string {
  if (amount === null || amount === undefined) return "—";
  const symbol = currency === "USD" ? "$" : `${currency} `;
  if (amount === 0) return "free";
  if (amount < 0.01) return `${symbol}${amount.toFixed(4)}`;
  if (amount < 1) return `${symbol}${amount.toFixed(3)}`;
  return `${symbol}${amount.toFixed(2)}`;
}
