import postgres from "postgres";

import { getDatabaseUrl } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __neon_sql__: ReturnType<typeof postgres> | undefined;
}

export function getSqlClient() {
  if (!global.__neon_sql__) {
    global.__neon_sql__ = postgres(getDatabaseUrl(), {
      max: 1,
      prepare: false,
    });
  }

  return global.__neon_sql__;
}
