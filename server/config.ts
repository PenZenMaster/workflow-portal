/*
 * Module/Script Name: config.ts
 * Path: server/config.ts
 *
 * Description:
 * Environment variable validation. Call validateEnv() at server startup
 * before any other setup. Throws with a clear message on invalid state
 * so misconfigured deployments fail fast rather than silently misbehave.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Initial implementation for S2-06
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  baseUrl: string;
}

export interface AppConfig {
  NODE_ENV: string;
  PORT: number;
  DATA_DB_PATH: string;
  SESSION_DB_PATH: string;
  SMTP: SmtpConfig | null;
  PERPLEXITY_API_KEY: string | null;
  PERPLEXITY_DAILY_USD_LIMIT: number;
  GOOGLE_CLIENT_ID: string | null;
  GOOGLE_CLIENT_SECRET: string | null;
  GOOGLE_REDIRECT_URI: string | null;
}

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "BASE_URL",
] as const;

export function validateEnv(): AppConfig {
  const NODE_ENV = process.env.NODE_ENV ?? "development";

  const secret = process.env.SESSION_SECRET ?? "";
  if (NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be a random string of at least 32 characters. " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  const smtpValues = SMTP_KEYS.map((k) => process.env[k] ?? "");
  const setCount = smtpValues.filter(Boolean).length;
  if (setCount > 0 && setCount < SMTP_KEYS.length) {
    const missing = SMTP_KEYS.filter((k) => !process.env[k]);
    throw new Error(
      `Incomplete SMTP configuration — set all or none. Missing: ${missing.join(", ")}`,
    );
  }

  return {
    NODE_ENV,
    PORT: parseInt(process.env.PORT || "5000", 10),
    DATA_DB_PATH: process.env.DATA_DB_PATH || "data.db",
    SESSION_DB_PATH: process.env.SESSION_DB_PATH || "sessions.db",
    SMTP:
      setCount === SMTP_KEYS.length
        ? {
            host: process.env.SMTP_HOST!,
            port: parseInt(process.env.SMTP_PORT!, 10),
            user: process.env.SMTP_USER!,
            pass: process.env.SMTP_PASS!,
            baseUrl: process.env.BASE_URL!,
          }
        : null,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || null,
    PERPLEXITY_DAILY_USD_LIMIT: parseFloat(
      process.env.PERPLEXITY_DAILY_USD_LIMIT || "10"
    ),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || null,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || null,
  };
}
