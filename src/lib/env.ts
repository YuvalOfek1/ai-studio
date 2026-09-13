/** Centralised, validated access to process configuration. */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env.`);
  return value;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  redisUrl: () => process.env.REDIS_URL ?? "redis://localhost:6380",
  appSecret: () => required("APP_SECRET", "insecure-development-secret-change-me-000000"),
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
    localDir: process.env.STORAGE_LOCAL_DIR ?? "./data/media",
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET ?? "ai-studio",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
    },
  },
  /** Provider keys may come from the environment or from the encrypted Credential table. */
  providerKeyFromEnv: (envVar: string) => process.env[envVar]?.trim() || undefined,
};
