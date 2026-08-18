import { describe, it, expect } from "vitest";
import { formatListenErrorMessage } from "../../server/devServerErrors";

function eaddrinuse(): NodeJS.ErrnoException {
  const err = new Error("listen EADDRINUSE: address already in use 0.0.0.0:5000") as NodeJS.ErrnoException;
  err.code = "EADDRINUSE";
  return err;
}

describe("formatListenErrorMessage", () => {
  it("returns a Windows-specific orphaned-process hint on win32", () => {
    const msg = formatListenErrorMessage(eaddrinuse(), "win32", 5000);
    expect(msg).toContain("5000");
    expect(msg).toContain("netstat -ano | findstr :5000");
    expect(msg).toContain("taskkill /PID <pid> /F");
  });

  it("returns a POSIX-specific hint on non-win32 platforms", () => {
    const msg = formatListenErrorMessage(eaddrinuse(), "linux", 5000);
    expect(msg).toContain("5000");
    expect(msg).toContain("lsof -i :5000");
    expect(msg).toContain("kill <pid>");
    expect(msg).not.toContain("taskkill");
  });

  it("returns null for non-EADDRINUSE errors so the caller re-throws", () => {
    const err = new Error("boom") as NodeJS.ErrnoException;
    err.code = "EACCES";
    expect(formatListenErrorMessage(err, "win32", 5000)).toBeNull();
  });
});
