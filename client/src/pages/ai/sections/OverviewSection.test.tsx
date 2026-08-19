import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { OverviewSection } from "./OverviewSection";

function overviewBody(period: string) {
  return {
    data: {
      citationFrequency: 10,
      mentionRate: 20,
      aiSoV: 30,
      avgVisibilityScore: 40,
      totalResponses: 99,
      period,
    },
  };
}

const TREND = { data: [{ date: "2026-08-01", value: 20 }] };

let lastOverviewUrl: string | null;
let lastTrendUrl: string | null;

beforeEach(() => {
  lastOverviewUrl = null;
  lastTrendUrl = null;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/metrics/overview")) {
      lastOverviewUrl = url;
      const period = new URL(url, "http://x").searchParams.get("period") ?? "30d";
      return { ok: true, status: 200, json: async () => overviewBody(period), text: async () => "" } as Response;
    }
    if (url.includes("/metrics/trend")) {
      lastTrendUrl = url;
      return { ok: true, status: 200, json: async () => TREND, text: async () => "" } as Response;
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
      <OverviewSection clientId="4" />
    </QueryClientProvider>
  );
}

// B-30 (rescoped): Overview's KPI cards and Mention Rate trend chart were
// hardcoded to period=30d with no user-facing selector at all.
describe("OverviewSection — period selector (B-30)", () => {
  it("defaults to 30d for both the KPI cards and the trend chart", async () => {
    renderSection();
    await waitFor(() => expect(lastOverviewUrl).toMatch(/period=30d/));
    expect(lastTrendUrl).toMatch(/period=30d/);
  });

  it("switching to 90d refetches both queries with the new period", async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText(/Citation Frequency/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "90d" }));

    await waitFor(() => expect(lastOverviewUrl).toMatch(/period=90d/));
    expect(lastTrendUrl).toMatch(/period=90d/);
  });

  it("updates the trend chart heading and response-count label to match the selected period", async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 3, name: /Last 30 Days/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "365d" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 3, name: /Last 12 Months/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/99 responses/)).toBeInTheDocument();
  });
});

describe("OverviewSection — link to detailed platform data", () => {
  it("scrolls to the platform-breakdown-section element when clicked", async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText(/Citation Frequency/i)).toBeInTheDocument());

    const target = document.createElement("div");
    target.id = "platform-breakdown-section";
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;
    document.body.appendChild(target);

    await user.click(screen.getByRole("button", { name: /view platform breakdown/i }));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth" });
    document.body.removeChild(target);
  });
});
