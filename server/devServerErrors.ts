/*
 * Module/Script Name: devServerErrors.ts
 * Path: server/devServerErrors.ts
 *
 * Description:
 * Formats a clear, actionable message for the HTTP server's 'error' event.
 * On Windows, stopping `npm run dev` (Ctrl+C, closing the terminal, or a
 * harness task kill) does not reliably terminate the underlying node.exe
 * child process, which can leave it holding the port - the next `npm run
 * dev` then fails with an unhandled EADDRINUSE stack trace that gives no
 * hint of the real cause. This turns that into a one-line diagnosis plus
 * the exact command to find and kill the orphan, per platform.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 Initial implementation for B-09
 */

export function formatListenErrorMessage(
  err: NodeJS.ErrnoException,
  platform: NodeJS.Platform,
  port: number
): string | null {
  if (err.code !== "EADDRINUSE") {
    return null;
  }

  const findAndKill =
    platform === "win32"
      ? `netstat -ano | findstr :${port}   (then)   taskkill /PID <pid> /F`
      : `lsof -i :${port}   (then)   kill <pid>`;

  return (
    `Port ${port} is already in use. This is usually a previous 'npm run dev' ` +
    `process that was stopped but did not fully exit${
      platform === "win32" ? " (common on Windows - the parent shell can die without killing the underlying node.exe)" : ""
    }. ` +
    `Find and stop it: ${findAndKill}`
  );
}
