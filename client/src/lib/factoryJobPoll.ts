/*
 * Module/Script Name: factoryJobPoll.ts
 * Path: client/src/lib/factoryJobPoll.ts
 *
 * Description:
 * Polls GET /api/factory/jobs/:id until a factory job reaches a terminal
 * status, for workflow-catalog cards that now create an async factory job
 * (server/jobs/factory.ts) instead of running inline in the POST /run
 * request - added when the Location Page Builder card's two-step tool loop
 * (read a sibling page's layout, then write the new one) started running
 * past the reverse-proxy timeout in front of the app when run synchronously.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-09-10
 * Last Modified Date: 2026-09-10
 * Comments:
 * - v1.00 Initial implementation
 */

interface FactoryJobPollData {
  status: string;
  output: Record<string, unknown> | null;
  lastError: string | null;
}

export interface PollFactoryJobOptions {
  /** Delay between polls, in ms. Default 5000. */
  intervalMs?: number;
  /** Overall time budget before giving up, in ms. Default 5 minutes. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export async function pollFactoryJob(
  jobId: number,
  options: PollFactoryJobOptions = {}
): Promise<string> {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const res = await fetchImpl(`/api/factory/jobs/${jobId}`, { credentials: "include" });
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    const json = (await res.json()) as { data: FactoryJobPollData };
    const job = json.data;

    if (job.status === "done") {
      const markdown = job.output?.markdown;
      if (typeof markdown !== "string") {
        throw new Error("Run completed with no output");
      }
      return markdown;
    }
    if (job.status === "failed") {
      throw new Error(job.lastError ?? "Run failed");
    }
    if (job.status === "cancelled") {
      throw new Error("Run was cancelled");
    }
    // queued / running / awaiting_approval - keep polling
  }

  throw new Error("Timed out waiting for the run to complete");
}
