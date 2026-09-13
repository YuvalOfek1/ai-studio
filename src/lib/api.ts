import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ProviderError } from "./providers/types";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** One error shape for every route, so the UI can always render `error`. */
export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return fail(`${first.path.join(".") || "request"}: ${first.message}`, 422);
  }
  if (error instanceof ProviderError) return fail(error.message, error.status ?? 502);
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error("[api]", error);
  return fail(message, 500);
}

export async function route<T>(handler: () => Promise<T>) {
  try {
    return ok(await handler());
  } catch (error) {
    return handleError(error);
  }
}
