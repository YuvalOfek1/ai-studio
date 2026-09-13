import { prisma } from "../db";
import { decryptSecret, encryptSecret, maskSecret } from "../crypto";
import { env } from "../env";
import { getProvider, PROVIDERS } from "./registry";
import { ProviderError, type ProviderCredential } from "./types";

/**
 * A key can come from the encrypted Credential table (pasted in Settings) or from
 * the environment. The table wins, so you can override a shared .env per machine.
 */
export async function resolveCredential(providerId: string): Promise<ProviderCredential> {
  const provider = getProvider(providerId);
  if (!provider.credential) return { secret: "", meta: {} };

  const row = await prisma.credential.findUnique({ where: { providerId } });
  const meta: Record<string, string> = { ...((row?.meta as Record<string, string> | undefined) ?? {}) };

  for (const extra of provider.credential.extraEnv ?? []) {
    if (!meta[extra.key]) {
      const fromEnv = env.providerKeyFromEnv(extra.envVar);
      if (fromEnv) meta[extra.key] = fromEnv;
    }
  }

  const secret = row ? decryptSecret(row.secret) : env.providerKeyFromEnv(provider.credential.envVar);
  if (!secret) {
    throw new ProviderError(
      `No API key for ${provider.label}. Add one in Settings, or set ${provider.credential.envVar} in .env.`,
    );
  }
  return { secret, meta };
}

export async function saveCredential(providerId: string, secret: string, meta: Record<string, string> = {}) {
  const provider = getProvider(providerId);
  if (!provider.credential) throw new ProviderError(`${provider.label} does not take an API key`);
  const data = { secret: encryptSecret(secret.trim()), meta, label: provider.credential.label };
  return prisma.credential.upsert({
    where: { providerId },
    create: { providerId, ...data },
    update: data,
  });
}

export async function deleteCredential(providerId: string) {
  await prisma.credential.deleteMany({ where: { providerId } });
}

/** Never returns a usable key — only enough to show state in Settings. */
export async function credentialStatuses() {
  const rows = await prisma.credential.findMany();
  const byProvider = new Map(rows.map((r) => [r.providerId, r]));
  return PROVIDERS.filter((p) => p.credential).map((provider) => {
    const row = byProvider.get(provider.id);
    const fromEnv = env.providerKeyFromEnv(provider.credential!.envVar);
    const stored = row ? decryptSecret(row.secret) : undefined;
    const secret = stored ?? fromEnv;
    return {
      providerId: provider.id,
      label: provider.label,
      website: provider.website,
      docs: provider.docs,
      credentialLabel: provider.credential!.label,
      help: provider.credential!.help,
      envVar: provider.credential!.envVar,
      extraEnv: provider.credential!.extraEnv ?? [],
      configured: Boolean(secret),
      source: stored ? "database" : fromEnv ? "environment" : null,
      masked: secret ? maskSecret(secret) : null,
      meta: (row?.meta as Record<string, string>) ?? {},
      capabilities: [...new Set(provider.models.map((m) => m.capability))],
    };
  });
}

export async function configuredProviderIds(): Promise<string[]> {
  const statuses = await credentialStatuses();
  return [...statuses.filter((s) => s.configured).map((s) => s.providerId), ...PROVIDERS.filter((p) => !p.credential).map((p) => p.id)];
}
