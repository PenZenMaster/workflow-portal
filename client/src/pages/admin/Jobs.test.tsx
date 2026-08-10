import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import Jobs from "./Jobs";

const COUNTS = { queued: 2, running: 1, done: 5, failed: 3, cancelled: 0 };

const ALL_JOBS = [
  { id: 1, kind: "parse-response", payload: "{}", status: "failed", attempts: 3, maxAttempts: 3, nextRunAt: Date.now(), lockedUntil: null, lastError: "boom", createdAt: Date.now(), updatedAt: Date.now() },
  { id: 2, kind: "parse-response", payload: "{}", status: "done", attempts: 1, maxAttempts: 3, nextRunAt: Date.now(), lockedUntil: null, lastError: null, createdAt: Date.now(), updatedAt: Date.now() },
];

const FAILED_JOBS = ALL_JOBS.filter((j) => j.status === "failed");

const HEALTH = {
  lastTickAt: Date.now(),
  secondsSinceTick: 5,
  intervalMs: 30_000,
  running: true,
  isStalled: false,
  counts: COUNTS,
  hungCount: 0,
};

let fetchMock: ReturnType<typeof vi.fn>;
let lastJobsUrl: string | null;

beforeEach(() => {
  lastJobsUrl = null;
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/jobs/health")) {
      return { ok: true, status: 200, json: async () => ({ data: HEALTH }), text: async () => "" } as Response;
    }
    if (url.startsWith("/api/jobs")) {
      lastJobsUrl = url;
      const isFailed = url.includes("status=failed");
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { jobs: isFailed ? FAILED_JOBS : ALL_JOBS, counts: COUNTS } }),
        text: async () => "",
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "" } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderJobs() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Jobs />
    </QueryClientProvider>
  );
}

describe("Jobs — status pill filtering (FR-001) and page-size limit (FR-002)", () => {
  it("requests a bounded page size by default, not the whole table", async () => {
    renderJobs();
    await waitFor(() => expect(lastJobsUrl).not.toBeNull());
    expect(lastJobsUrl).toMatch(/limit=/);
  });

  it("clicking a status pill filters the jobs list by that status", async () => {
    const user = userEvent.setup();
    renderJobs();
    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());

    const failedPill = screen.getByRole("button", { name: /failed/i });
    await user.click(failedPill);

    await waitFor(() => expect(lastJobsUrl).toMatch(/status=failed/));
    await waitFor(() => expect(screen.queryByText("#2")).not.toBeInTheDocument());
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("clicking the active pill again clears the filter", async () => {
    const user = userEvent.setup();
    renderJobs();
    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /failed/i }));
    await waitFor(() => expect(lastJobsUrl).toMatch(/status=failed/));
    await waitFor(() => expect(screen.queryByText("#2")).not.toBeInTheDocument());

    // Toggling back to the unfiltered key react-query already cached from
    // initial mount may be served from cache without a new fetch() call -
    // assert on rendered content, not on lastJobsUrl. Re-query the button
    // fresh rather than reusing the pre-click reference.
    await user.click(screen.getByRole("button", { name: /failed/i }));
    await waitFor(() => expect(screen.getByText("#2")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /failed/i })).toHaveAttribute("aria-pressed", "false");
  });
});
