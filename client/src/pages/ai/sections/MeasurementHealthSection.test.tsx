import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { MeasurementHealthSection } from "./MeasurementHealthSection";

function authStatus(role: "super_admin" | "agency_admin" | "analyst" | "client_viewer") {
  return {
    needsSetup: false,
    authenticated: true,
    user: { id: 1, username: "admin", email: null, role },
    config: { perplexityConfigured: true, googleOAuthConfigured: false, configuredPlatforms: ["perplexity"] },
  };
}

const HEALTHY_RUN = { runId: 1, status: "healthy" as const, reasons: [], override: null };
const DEGRADED_RUN = {
  runId: 2,
  status: "degraded" as const,
  reasons: ["provider failure rate 25.0% exceeds 20.0%"],
  override: null,
};

let fetchMock: ReturnType<typeof vi.fn>;
let currentRole: "super_admin" | "agency_admin" | "analyst" | "client_viewer";
let jobsData: { period: string; runs: unknown[]; rollup: Record<string, number> };
let lastRequest: { method: string; url: string; body: unknown } | null;

beforeEach(() => {
  currentRole = "agency_admin";
  jobsData = {
    period: "30d",
    runs: [HEALTHY_RUN, DEGRADED_RUN],
    rollup: { totalRuns: 2, healthy: 1, healthyWithWarnings: 0, degraded: 1, invalidForReporting: 0 },
  };
  lastRequest = null;

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    lastRequest = { method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined };

    if (url === "/api/auth/status") {
      return { ok: true, status: 200, json: async () => authStatus(currentRole), text: async () => "" } as Response;
    }
    if (url.startsWith("/api/clients/") && url.includes("/measurement-health") && method === "GET") {
      return { ok: true, status: 200, json: async () => ({ data: jobsData }), text: async () => "" } as Response;
    }
    if (url.match(/\/api\/runs\/\d+\/measurement-health\/override/) && (method === "PATCH" || method === "DELETE")) {
      return { ok: true, status: 200, json: async () => ({ data: {} }), text: async () => "" } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "" } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MeasurementHealthSection clientId="4" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("MeasurementHealthSection", () => {
  it("renders the N of M healthy summary and a per-run status list", async () => {
    renderSection();

    await waitFor(() => expect(screen.getByText(/1 of 2 runs healthy/)).toBeInTheDocument());
    expect(screen.getByText(/1 degraded/)).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });

  it("renders nothing when there are no runs in the period", async () => {
    jobsData = { period: "30d", runs: [], rollup: { totalRuns: 0, healthy: 0, healthyWithWarnings: 0, degraded: 0, invalidForReporting: 0 } };
    const { container } = renderSection();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  describe("admin override control (issue #30 slice 5b)", () => {
    it("shows an Override action for admin/agency_admin roles", async () => {
      currentRole = "agency_admin";
      renderSection();
      await waitFor(() => expect(screen.getAllByRole("button", { name: /override/i })).toHaveLength(2));
    });

    it("does not show an Override action for non-admin roles", async () => {
      currentRole = "analyst";
      renderSection();
      await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /override/i })).not.toBeInTheDocument();
    });

    it("submits an override with the selected status and typed reason, then refetches the list", async () => {
      const user = userEvent.setup();
      renderSection();
      await waitFor(() => expect(screen.getAllByRole("button", { name: /^override$/i })).toHaveLength(2));

      const [, overrideDegraded] = screen.getAllByRole("button", { name: /^override$/i });
      await user.click(overrideDegraded);

      await user.selectOptions(screen.getByLabelText(/status/i), "healthy");
      await user.type(screen.getByLabelText(/reason/i), "confirmed transient provider outage");
      await user.click(screen.getByRole("button", { name: /^save$/i }));

      await waitFor(() =>
        expect(lastRequest).toEqual({
          method: "PATCH",
          url: "/api/runs/2/measurement-health/override",
          body: { status: "healthy", reason: "confirmed transient provider outage" },
        })
      );
    });

    it("disables Save until a reason is entered", async () => {
      const user = userEvent.setup();
      renderSection();
      await waitFor(() => expect(screen.getAllByRole("button", { name: /^override$/i })).toHaveLength(2));

      await user.click(screen.getAllByRole("button", { name: /^override$/i })[0]);
      expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

      await user.type(screen.getByLabelText(/reason/i), "a reason");
      expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
    });

    it("shows a Clear override action for an already-overridden run, and calls DELETE", async () => {
      jobsData = {
        period: "30d",
        runs: [
          {
            runId: 2,
            status: "healthy",
            reasons: ["provider failure rate 25.0% exceeds 20.0%"],
            override: {
              id: 1, runId: 2, status: "healthy",
              reason: "confirmed transient provider outage",
              overriddenByUserId: 1, createdAt: Date.now(), updatedAt: Date.now(),
            },
          },
        ],
        rollup: { totalRuns: 1, healthy: 1, healthyWithWarnings: 0, degraded: 0, invalidForReporting: 0 },
      };
      const user = userEvent.setup();
      renderSection();

      const clearButton = await screen.findByRole("button", { name: /clear override/i });
      await user.click(clearButton);

      await waitFor(() =>
        expect(lastRequest).toEqual({ method: "DELETE", url: "/api/runs/2/measurement-health/override", body: undefined })
      );
    });
  });
});
