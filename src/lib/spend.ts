import { prisma } from "./db";
import { PROVIDERS } from "./providers/registry";

/**
 * Spend reporting.
 *
 * What counts as spent: a job the vendor actually ran. SUCCEEDED jobs carry a
 * real cost (computed from what came back); QUEUED and RUNNING jobs carry an
 * estimate and are reported separately as "in flight". FAILED and CANCELED jobs
 * are excluded from the total and shown on their own, since a failed generation
 * is usually not billed — if your vendor does bill for them, the number you want
 * is total + failed, and both are on the page.
 */

const SESSION_GAP_MINUTES = Number(process.env.SPEND_SESSION_GAP_MINUTES ?? 30);

export interface SpendSession {
  id: string;
  startedAt: string;
  endedAt: string;
  amount: number;
  jobs: number;
  projects: string[];
  models: string[];
}

export interface SpendSummary {
  currency: string;
  sessionGapMinutes: number;
  totals: {
    allTime: number;
    thisMonth: number;
    last30Days: number;
    today: number;
    inFlight: number;
    failed: number;
    jobs: number;
    unpriced: number;
  };
  byMonth: { month: string; label: string; amount: number; jobs: number }[];
  byModel: {
    providerId: string;
    modelId: string;
    providerLabel: string;
    modelLabel: string;
    capability: string;
    amount: number;
    jobs: number;
    unit: string | null;
    quantity: number;
  }[];
  byProvider: { providerId: string; label: string; amount: number; jobs: number }[];
  byProject: { projectId: string; name: string; amount: number; jobs: number }[];
  sessions: SpendSession[];
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
};
const round = (value: number) => Number(value.toFixed(4));

function labelsFor(providerId: string, modelId: string) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  return { providerLabel: provider?.label ?? providerId, modelLabel: model?.label ?? modelId };
}

export async function spendSummary(options: { projectId?: string; months?: number } = {}): Promise<SpendSummary> {
  const months = options.months ?? 12;
  const jobs = await prisma.job.findMany({
    where: options.projectId ? { projectId: options.projectId } : {},
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      providerId: true,
      modelId: true,
      capability: true,
      projectId: true,
      costAmount: true,
      costCurrency: true,
      costUnit: true,
      costQuantity: true,
      project: { select: { name: true } },
    },
  });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const totals = { allTime: 0, thisMonth: 0, last30Days: 0, today: 0, inFlight: 0, failed: 0, jobs: 0, unpriced: 0 };
  const byMonth = new Map<string, { amount: number; jobs: number }>();
  const byModel = new Map<string, SpendSummary["byModel"][number]>();
  const byProvider = new Map<string, { amount: number; jobs: number }>();
  const byProject = new Map<string, { name: string; amount: number; jobs: number }>();
  const sessions: SpendSession[] = [];

  // pre-seed the last N months so the chart has a continuous axis, not gaps
  for (let index = months - 1; index >= 0; index--) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    byMonth.set(monthKey(date), { amount: 0, jobs: 0 });
  }

  let session: SpendSession | null = null;

  for (const job of jobs) {
    const amount = job.costAmount ?? 0;
    const billable = job.status === "SUCCEEDED";
    const inFlight = job.status === "QUEUED" || job.status === "RUNNING";

    if (job.costAmount === null) totals.unpriced += 1;
    if (inFlight) totals.inFlight += amount;
    if (job.status === "FAILED" || job.status === "CANCELED") totals.failed += amount;
    if (!billable) continue;

    totals.jobs += 1;
    totals.allTime += amount;
    if (job.createdAt >= startOfMonth) totals.thisMonth += amount;
    if (job.createdAt >= thirtyDaysAgo) totals.last30Days += amount;
    if (job.createdAt >= startOfToday) totals.today += amount;

    const key = monthKey(job.createdAt);
    const month = byMonth.get(key);
    if (month) {
      month.amount += amount;
      month.jobs += 1;
    } else {
      byMonth.set(key, { amount, jobs: 1 });
    }

    const modelKey = `${job.providerId}:${job.modelId}`;
    const existing = byModel.get(modelKey);
    if (existing) {
      existing.amount += amount;
      existing.jobs += 1;
      existing.quantity += job.costQuantity ?? 0;
    } else {
      byModel.set(modelKey, {
        providerId: job.providerId,
        modelId: job.modelId,
        ...labelsFor(job.providerId, job.modelId),
        capability: job.capability,
        amount,
        jobs: 1,
        unit: job.costUnit,
        quantity: job.costQuantity ?? 0,
      });
    }

    const provider = byProvider.get(job.providerId) ?? { amount: 0, jobs: 0 };
    provider.amount += amount;
    provider.jobs += 1;
    byProvider.set(job.providerId, provider);

    const project = byProject.get(job.projectId) ?? { name: job.project?.name ?? "Deleted project", amount: 0, jobs: 0 };
    project.amount += amount;
    project.jobs += 1;
    byProject.set(job.projectId, project);

    // a session is a sitting: consecutive work with no long gap in between
    const gapMs = SESSION_GAP_MINUTES * 60_000;
    if (session && job.createdAt.getTime() - new Date(session.endedAt).getTime() <= gapMs) {
      session.endedAt = job.createdAt.toISOString();
      session.amount += amount;
      session.jobs += 1;
      if (!session.projects.includes(project.name)) session.projects.push(project.name);
      const { modelLabel } = labelsFor(job.providerId, job.modelId);
      if (!session.models.includes(modelLabel)) session.models.push(modelLabel);
    } else {
      const { modelLabel } = labelsFor(job.providerId, job.modelId);
      session = {
        id: job.id,
        startedAt: job.createdAt.toISOString(),
        endedAt: job.createdAt.toISOString(),
        amount,
        jobs: 1,
        projects: [project.name],
        models: [modelLabel],
      };
      sessions.push(session);
    }
  }

  return {
    currency: "USD",
    sessionGapMinutes: SESSION_GAP_MINUTES,
    totals: {
      allTime: round(totals.allTime),
      thisMonth: round(totals.thisMonth),
      last30Days: round(totals.last30Days),
      today: round(totals.today),
      inFlight: round(totals.inFlight),
      failed: round(totals.failed),
      jobs: totals.jobs,
      unpriced: totals.unpriced,
    },
    byMonth: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-months)
      .map(([month, value]) => ({ month, label: monthLabel(month), amount: round(value.amount), jobs: value.jobs })),
    byModel: [...byModel.values()].map((m) => ({ ...m, amount: round(m.amount) })).sort((a, b) => b.amount - a.amount),
    byProvider: [...byProvider.entries()]
      .map(([providerId, value]) => ({
        providerId,
        label: PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId,
        amount: round(value.amount),
        jobs: value.jobs,
      }))
      .sort((a, b) => b.amount - a.amount),
    byProject: [...byProject.entries()]
      .map(([projectId, value]) => ({ projectId, name: value.name, amount: round(value.amount), jobs: value.jobs }))
      .sort((a, b) => b.amount - a.amount),
    sessions: sessions.reverse().slice(0, 30).map((s) => ({ ...s, amount: round(s.amount) })),
  };
}

/** The small numbers the corner widget needs — cheap enough to poll. */
export async function spendPulse() {
  const summary = await spendSummary({ months: 1 });
  const current = summary.sessions[0];
  const live = current && Date.now() - new Date(current.endedAt).getTime() < SESSION_GAP_MINUTES * 60_000 ? current : null;
  return {
    currency: summary.currency,
    today: summary.totals.today,
    thisMonth: summary.totals.thisMonth,
    allTime: summary.totals.allTime,
    inFlight: summary.totals.inFlight,
    session: live ? { amount: live.amount, jobs: live.jobs, startedAt: live.startedAt } : null,
  };
}
