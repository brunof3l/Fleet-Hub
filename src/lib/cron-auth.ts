import { timingSafeEqual } from "node:crypto";

import { getCronSecret } from "@/lib/env";

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Authorizes automation/cron requests. Fail-closed: if CRON_SECRET is not
 * configured, every request is denied (no anonymous access to job routes).
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) {
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}
