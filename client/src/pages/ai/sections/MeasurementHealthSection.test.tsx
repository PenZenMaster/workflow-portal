import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { MeasurementHealthSection } from "./MeasurementHealthSection";

let fetchMock: ReturnType<typeof vi.fn>;
let apiStatus: number;
let apiBody: unknown;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: apiStatus >= 200 && apiStatus < 300,
    status: apiStatus,
    json: async () => apiBody,
    text: async () => JSON.stringify(apiBody),
  }) as Response);
  vi.stubGlobal("fetch", fetchMock);
});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MeasurementHealthSection clientId="4" />
    </QueryClientProvider>
  );
}

describe("MeasurementHealthSection", () => {
  it("renders the N of M healthy summary and a per-run status list", async () => {
    apiStatus = 200;
    apiBody = {
      data: {
        period: "30d",
        runs: [
          { runId: 1, status: "healthy", reasons: [] },
          { runId: 2, status: "invalid_for_reporting", reasons: ["completion rate 30.0% is below the 50.0% reporting threshold"] },
        ],
        rollup: { totalRuns: 2, healthy: 1, healthyWithWarnings: 0, degraded: 0, invalidForReporting: 1 },
      },
    };
    renderSection();

    await waitFor(() => expect(screen.getByText(/1 of 2 runs healthy/)).toBeInTheDocument());
    expect(screen.getByText(/1 invalid for reporting/)).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Invalid for reporting")).toBeInTheDocument();
  });

  it("renders nothing when there are no runs in the period", async () => {
    apiStatus = 200;
    apiBody = {
      data: {
        period: "30d",
        runs: [],
        rollup: { totalRuns: 0, healthy: 0, healthyWithWarnings: 0, degraded: 0, invalidForReporting: 0 },
      },
    };
    const { container } = renderSection();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when the endpoint denies access (client_viewer)", async () => {
    apiStatus = 403;
    apiBody = { error: "Forbidden" };
    const { container } = renderSection();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
