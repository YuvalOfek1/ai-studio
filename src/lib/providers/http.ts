import { ProviderError } from "./types";

const DEFAULT_TIMEOUT_MS = 120_000;

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  timeoutMs?: number;
  /** Label used in error messages so failures name the vendor and the call. */
  label: string;
}

async function request(url: string, opts: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(
        `${opts.label} failed (HTTP ${res.status}): ${text.slice(0, 600) || res.statusText}`,
        res.status,
        text,
      );
    }
    return res;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if ((err as Error).name === "AbortError") throw new ProviderError(`${opts.label} timed out`);
    throw new ProviderError(`${opts.label} failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T = unknown>(url: string, opts: RequestOptions): Promise<T> {
  const res = await request(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError(`${opts.label} returned non-JSON response: ${text.slice(0, 300)}`);
  }
}

export async function requestBinary(
  url: string,
  opts: RequestOptions,
): Promise<{ data: Buffer; mimeType: string }> {
  const res = await request(url, opts);
  const data = Buffer.from(await res.arrayBuffer());
  return { data, mimeType: res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" };
}

export function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", ...extra };
}
