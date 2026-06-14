import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import RunDetail from "./RunDetail";

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ runId: "1" }) };
});

const BASE_RUN = {
  id: 1,
  clientId: 4,
  collectionId: 1,
  batchId: "batch-1",
  triggeredBy: "manual" as const,
  triggeredByUserId: 1,
  totalPrompts: 1,
  startedAt: Date.now(),
  finishedAt: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const FAILED_RESPONSE = {
  id: 10,
  runId: 1,
  promptId: 1,
  platformId: 1,
  queryText: "What kind of reputation does Salvo Metal Works have?",
  locale: null,
  geo: null,
  status: "failed",
  responseText: null,
  responseSummaryBlock: null,
  modelVariant: null,
  latencyMs: null,
  rawPayload: null,
  errorMessage: "Gemini API returned 429",
  capturedAt: Date.now(),
};

const COMPLETE_RESPONSE = {
  ...FAILED_RESPONSE,
  id: 11,
  status: "complete",
  responseText: "Salvo Metal Works has a strong reputation...",
  errorMessage: null,
};

let fetchMock: ReturnType<typeof vi.fn>;
let runApiResponse: unknown;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "POST" && url === "/api/runs/1/retry-failed") {
      return { ok: true, status: 202, json: async () => ({ data: { retriedCount: 1 } }), text: async () => "" } as Response;
    }

    if (url === `/api/runs/1`) {
      return { ok: true, status: 200, json: async () => runApiResponse, text: async () => JSON.stringify(runApiResponse) } as Response;
    }

    return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "{}" } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
});

function renderRunDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RunDetail />
    </QueryClientProvider>,
  );
}

describe("RunDetail — Retry failed", () => {
  it("shows a Retry failed button when the run has failed responses and triggers the retry endpoint", async () => {
    runApiResponse = {
      data: {
        run: { ...BASE_RUN, status: "failed", completedPrompts: 0, failedPrompts: 1 },
        responses: [FAILED_RESPONSE],
      },
    };
    renderRunDetail();

    const retryButton = await screen.findByRole("button", { name: /Retry failed/i });
    await userEvent.click(retryButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/runs/1/retry-failed",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("does not show a Retry failed button when there are no failed responses", async () => {
    runApiResponse = {
      data: {
        run: { ...BASE_RUN, status: "complete", completedPrompts: 1, failedPrompts: 0 },
        responses: [COMPLETE_RESPONSE],
      },
    };
    renderRunDetail();

    await screen.findByRole("heading", { name: "Responses" });
    expect(screen.queryByRole("button", { name: /Retry failed/i })).not.toBeInTheDocument();
  });
});
