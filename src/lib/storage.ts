import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Media never lives in Postgres. It is written through a driver so the same code
 * works against local disk today and S3/MinIO when this moves to a cloud VM.
 */
export interface StoredObject {
  key: string;
  size: number;
  mimeType: string;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
};

export function extensionFor(mimeType: string, fallback = "bin"): string {
  return EXT_BY_MIME[mimeType.split(";")[0].trim().toLowerCase()] ?? fallback;
}

export function buildKey(projectId: string, mimeType: string, prefix = "media"): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}/${projectId}/${stamp}/${crypto.randomUUID()}.${extensionFor(mimeType)}`;
}

interface Driver {
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; mimeType?: string }>;
  delete(key: string): Promise<void>;
}

const localDriver: Driver = {
  async put(key, body) {
    const full = path.resolve(env.storage.localDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  },
  async get(key) {
    const full = path.resolve(env.storage.localDir, key);
    return { body: await fs.readFile(full) };
  },
  async delete(key) {
    await fs.rm(path.resolve(env.storage.localDir, key), { force: true });
  },
};

let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;
async function s3(): Promise<Driver> {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const cfg = env.storage.s3;
  s3Client ??= new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return {
    async put(key, body, mimeType) {
      await s3Client!.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: mimeType }));
    },
    async get(key) {
      const res = await s3Client!.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      const body = Buffer.from(await res.Body!.transformToByteArray());
      return { body, mimeType: res.ContentType };
    },
    async delete(key) {
      await s3Client!.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

async function driver(): Promise<Driver> {
  return env.storage.driver === "s3" ? s3() : localDriver;
}

export async function putObject(
  projectId: string,
  body: Buffer,
  mimeType: string,
  prefix = "media",
): Promise<StoredObject> {
  const key = buildKey(projectId, mimeType, prefix);
  await (await driver()).put(key, body, mimeType);
  return { key, size: body.byteLength, mimeType };
}

export async function getObject(key: string) {
  return (await driver()).get(key);
}

export async function deleteObject(key: string) {
  try {
    await (await driver()).delete(key);
  } catch {
    // deleting media that is already gone is not an error worth surfacing
  }
}

/** Public URL the browser can use for an asset. */
export function mediaUrl(key: string): string {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}
