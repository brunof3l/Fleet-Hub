function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function hasDatabaseConfig(): boolean {
  return Boolean(readEnv("DATABASE_URL"));
}

export function getDatabaseUrl(): string {
  const value = readEnv("DATABASE_URL");
  if (!value) {
    throw new Error("DATABASE_URL nao configurado.");
  }

  return value;
}

export function getCronSecret(): string | undefined {
  return readEnv("CRON_SECRET");
}

export function getReportRecipient(): string | undefined {
  return readEnv("REPORT_RECIPIENT_EMAIL");
}

export function getResendApiKey(): string | undefined {
  return readEnv("RESEND_API_KEY");
}

export function getResendFromEmail(): string | undefined {
  return readEnv("RESEND_FROM_EMAIL");
}
