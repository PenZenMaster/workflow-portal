import { describe, it, expect, vi, beforeEach } from "vitest";
import { pollFactoryJob } from "./factoryJobPoll";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("pollFactoryJob", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("polls until status is done and returns the markdown output", async () => {
    fetchImpl
      .mockResolvedValueOnce(jsonResponse({ data: { status: "queued", output: null, lastError: null } }))
      .mockResolvedValueOnce(jsonResponse({ data: { status: "running", output: null, lastError: null } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { status: "done", output: { markdown: "Created 1 page" }, lastError: null } })
      );

    const markdown = await pollFactoryJob(42, { intervalMs: 1, fetchImpl });

    expect(markdown).toBe("Created 1 page");
    expect(fetchImpl).toHaveBeenCalledWith("/api/factory/jobs/42", { credentials: "include" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws with the job's lastError when status is failed", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ data: { status: "failed", output: null, lastError: "No RankRocket site key configured" } })
    );

    await expect(pollFactoryJob(1, { intervalMs: 1, fetchImpl })).rejects.toThrow(
      "No RankRocket site key configured"
    );
  });

  it("throws a generic message when failed with no lastError", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: { status: "failed", output: null, lastError: null } }));

    await expect(pollFactoryJob(1, { intervalMs: 1, fetchImpl })).rejects.toThrow(/run failed/i);
  });

  it("throws when status is cancelled", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: { status: "cancelled", output: null, lastError: null } }));

    await expect(pollFactoryJob(1, { intervalMs: 1, fetchImpl })).rejects.toThrow(/cancelled/i);
  });

  it("throws when the poll request itself fails", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({}, false, 500));

    await expect(pollFactoryJob(1, { intervalMs: 1, fetchImpl })).rejects.toThrow("Request failed (500)");
  });

  it("throws when done but output has no markdown", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: { status: "done", output: {}, lastError: null } }));

    await expect(pollFactoryJob(1, { intervalMs: 1, fetchImpl })).rejects.toThrow(/no output/i);
  });

  it("times out if the job never resolves in time", async () => {
    fetchImpl.mockResolvedValue(jsonResponse({ data: { status: "running", output: null, lastError: null } }));

    await expect(
      pollFactoryJob(1, { intervalMs: 2, timeoutMs: 10, fetchImpl })
    ).rejects.toThrow(/timed out/i);
  });
});
