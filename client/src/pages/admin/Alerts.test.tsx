import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import Alerts from "./Alerts";

const ALERTS = [
  {
    id: "integration-1",
    kind: "integration_failing",
    clientId: 4,
    clientName: "Salvo Metal Works",
    message: "ga4 integration failing: token expired",
    detailHref: "/ai/clients/4/settings/integrations",
    occurredAt: Date.now() - 60_000,
  },
  {
    id: "job-7",
    kind: "job_failed",
    clientId: null,
    clientName: null,
    message: 'Job "schedule-tick" failed: boom',
    detailHref: "/admin/jobs",
    occurredAt: Date.now() - 120_000,
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
let alertsResponse: typeof ALERTS;

beforeEach(() => {
  alertsResponse = ALERTS;
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/admin/alerts")) {
      return { ok: true, status: 200, json: async () => ({ data: { alerts: alertsResponse } }), text: async () => "" } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "" } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderAlerts() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Alerts />
    </QueryClientProvider>
  );
}

describe("Admin Alerts page", () => {
  it("fetches on load without a polling interval (on-load + manual refresh only)", async () => {
    renderAlerts();
    await waitFor(() => expect(screen.getByText(/token expired/i)).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/admin/alerts"))).toHaveLength(1);
  });

  it("renders each alert's message and, when present, a link to the client using the alert's own detailHref", async () => {
    renderAlerts();
    await waitFor(() => expect(screen.getByText(/token expired/i)).toBeInTheDocument());

    const clientLink = screen.getByRole("link", { name: /Salvo Metal Works/i });
    expect(clientLink).toHaveAttribute("href", "/ai/clients/4/settings/integrations");
  });

  it("renders an alert with no client (clientId null) without a client link", async () => {
    renderAlerts();
    await waitFor(() => expect(screen.getByText(/schedule-tick/i)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /schedule-tick/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no active alerts", async () => {
    alertsResponse = [];
    renderAlerts();
    await waitFor(() => expect(screen.getByText(/no active alerts/i)).toBeInTheDocument());
  });
});
