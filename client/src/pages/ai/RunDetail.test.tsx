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
  inputTokens: 42,
  outputTokens: 117,
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

describe("RunDetail — Token usage totals", () => {
  it("sums input/output tokens across responses in the run header", async () => {
    runApiResponse = {
      data: {
        run: { ...BASE_RUN, status: "complete", completedPrompts: 2, failedPrompts: 0 },
        responses: [
          COMPLETE_RESPONSE,
          { ...COMPLETE_RESPONSE, id: 12, inputTokens: 8, outputTokens: 3 },
        ],
      },
    };
    renderRunDetail();

    expect(await screen.findByText(/Tokens: 50 in \/ 120 out/)).toBeInTheDocument();
  });

  it("omits the token line when no response has usage data", async () => {
    runApiResponse = {
      data: {
        run: { ...BASE_RUN, status: "complete", completedPrompts: 1, failedPrompts: 0 },
        responses: [{ ...COMPLETE_RESPONSE, inputTokens: null, outputTokens: null }],
      },
    };
    renderRunDetail();

    await screen.findByRole("heading", { name: "Responses" });
    expect(screen.queryByText(/Tokens:/)).not.toBeInTheDocument();
  });
});

describe("RunDetail — Comparability panel (E2b)", () => {
  beforeEach(() => {
    runApiResponse = {
      data: {
        run: { ...BASE_RUN, status: "complete", completedPrompts: 1, failedPrompts: 0 },
        responses: [COMPLETE_RESPONSE],
      },
    };
  });

  function mockComparability(payload: unknown, status = 200) {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET" && url === "/api/runs/1/comparability") {
        return {
          ok: status < 400,
          status,
          json: async () => payload,
          text: async () => JSON.stringify(payload),
        } as Response;
      }
      return base(url, init);
    });
  }

  it("shows a warning verdict with reasons versus the previous run", async () => {
    mockComparability({
      data: {
        status: "comparable_with_warning",
        baseRunId: 3,
        currentRunId: 1,
        reasons: [
          { code: "parser_changed", severity: "warning", detail: "parser 1.0 -> 1.1" },
        ],
      },
    });
    renderRunDetail();

    expect(await screen.findByText(/Comparable with warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/vs run #3/i)).toBeInTheDocument();
    expect(screen.getByText(/parser 1\.0 -> 1\.1/)).toBeInTheDocument();
  });

  it("shows a not-comparable verdict", async () => {
    mockComparability({
      data: {
        status: "not_comparable",
        baseRunId: 3,
        currentRunId: 1,
        reasons: [
          { code: "platforms_changed", severity: "blocking", detail: "platforms [1] -> [1, 2]" },
        ],
      },
    });
    renderRunDetail();

    expect(await screen.findByText(/Not comparable/i)).toBeInTheDocument();
    expect(screen.getByText(/platforms \[1\] -> \[1, 2\]/)).toBeInTheDocument();
  });

  it("renders no comparability panel when there is no baseline (404)", async () => {
    mockComparability({ error: "No earlier run with a manifest", code: "NO_BASELINE" }, 404);
    renderRunDetail();

    await screen.findByRole("heading", { name: "Responses" });
    expect(screen.queryByText(/comparable/i)).not.toBeInTheDocument();
  });
});

describe("RunDetail — Recommendations panel", () => {
  const RECOMMENDATION = {
    id: 5,
    responseId: 11,
    brandId: 10,
    brandName: "Salvo Metal Works",
    status: "listed_option",
    rank: 2,
    confidence: 0.7,
    evidenceExcerpt: "2. Salvo Metal Works - known for...",
    classifierVersion: "rules-1.0",
    humanStatus: null,
    humanUserId: null,
    humanAt: null,
  };

  beforeEach(() => {
    runApiResponse = {
      data: {
        run: { ...BASE_RUN, status: "complete", completedPrompts: 1, failedPrompts: 0 },
        responses: [COMPLETE_RESPONSE],
      },
    };
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET" && url === "/api/responses/11/recommendations") {
        return {
          ok: true, status: 200,
          json: async () => ({ data: [RECOMMENDATION] }),
          text: async () => JSON.stringify({ data: [RECOMMENDATION] }),
        } as Response;
      }
      if (method === "PATCH" && url === "/api/response-recommendations/5") {
        const updated = { data: { ...RECOMMENDATION, humanStatus: "recommended", humanUserId: 1, humanAt: Date.now() } };
        return { ok: true, status: 200, json: async () => updated, text: async () => JSON.stringify(updated) } as Response;
      }
      return base(url, init);
    });
  });

  it("loads and shows brand classifications when the panel is expanded", async () => {
    renderRunDetail();

    const toggle = await screen.findByRole("button", { name: /Recommendations/i });
    await userEvent.click(toggle);

    expect(await screen.findByText("Salvo Metal Works")).toBeInTheDocument();
    const select = screen.getByLabelText(/Override status for Salvo Metal Works/i) as HTMLSelectElement;
    expect(select.value).toBe("listed_option");
  });

  it("submits a human override via PATCH and reflects the corrected status", async () => {
    renderRunDetail();

    await userEvent.click(await screen.findByRole("button", { name: /Recommendations/i }));
    const select = await screen.findByLabelText(/Override status for Salvo Metal Works/i);
    await userEvent.selectOptions(select, "recommended");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/response-recommendations/5",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "recommended" }) }),
      ),
    );
  });
});
