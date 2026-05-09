/*
 * Module/Script Name: logger.ts
 * Path: server/logger.ts
 *
 * Description:
 * Zero-dependency structured JSON logger. Each call emits a single JSON line
 * to stdout (info/warn) or stderr (error) so log aggregators can parse it.
 * Context fields are merged at the top level after ts/level/msg so those
 * three fields cannot be overridden by callers.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Initial implementation for S2-04
 */

type Level = "info" | "warn" | "error";
type Context = Record<string, unknown>;

function write(level: Level, msg: string, ctx: Context = {}): void {
  const entry = { ...ctx, ts: new Date().toISOString(), level, msg };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  info:  (msg: string, ctx?: Context) => write("info",  msg, ctx),
  warn:  (msg: string, ctx?: Context) => write("warn",  msg, ctx),
  error: (msg: string, ctx?: Context) => write("error", msg, ctx),
};
