import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import ClientDetail from "./ClientDetail";

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ id: "4" }) };
});

const API_RESPONSES: Record<string, unknown> = {
  "/api/auth/status": {
    needsSetup: false,
    authenticated: true,
    user: { id: 1, username: "admin", email: null, role: "analyst" },
    config: { perplexityConfigured: true, googleOAuthConfigured: false, configuredPlatforms: ["perplexity"] },
  },
  "/api/clients/4": { data: { id: 4, name: "Acme", primaryDomain: "acme.com", geographies: [] } },
  "/api/clients/4/brands": { data: [] },
  "/api/clients/4/readiness": {
    data: {
      clientId: 4,
      hasClientBrand: true,
      competitorBrandCount: 0,
      competitorBrandsWithAliasCount: 0,
      hasActivePromptCollectionWithPrompts: false,
      ready: false,
      issues: [
        "No competitor brands defined - AI Share of Voice will be meaningless",
        "No active prompt collection with prompts",
      ],
      actionableIssues: [
        { message: "No competitor brands defined - AI Share of Voice will be meaningless", href: "/ai/clients/4" },
        { message: "No active prompt collection with prompts", href: "/ai/clients/4/prompts" },
      ],
    },
  },
  "/api/clients/4/metrics/overview?period=30d": {
    data: { citationFrequency: 0, mentionRate: 0, aiSoV: 0, avgVisibilityScore: 0, totalResponses: 0, period: "30d" },
  },
  "/api/clients/4/metrics/trend?metric=mentionRate&period=30d": { data: [] },
  "/api/clients/4/mentions?limit=20": { data: { mentions: [], total: 0 } },
  "/api/clients/4/metrics/sov": {
    data: { aiSoV: 0, clientMentions: 0, allBrandMentions: 0, fromDate: "2026-05-01", toDate: "2026-06-01" },
  },
  "/api/clients/4/sentiment/summary": { data: { positive: 0, neutral: 0, negative: 0, mixed: 0 } },
  "/api/clients/4/sources": {
    data: { domainCounts: [], ownedCount: 0, thirdPartyCount: 0, ownedPercent: 0, topDomains: [] },
  },
  "/api/clients/4/recommendations": { data: [] },
  "/api/clients/4/traffic?period=30d": {
    data: { noIntegration: true, sessions: 0, engagementRate: 0, pagesPerSession: 0, conversionRate: 0, referrers: [], fromDate: "", toDate: "" },
  },
  "/api/clients/4/traffic/monthly?period=6m": {
    data: { noIntegration: true, months: [], allSources: [], fromDate: "", toDate: "" },
  },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = API_RESPONSES[url] ?? { data: null };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response;
    }),
  );
});

function renderClientDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClientDetail />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ClientDetail (consolidated AI visibility page)", () => {
  it("renders all report sections inline on one page", async () => {
    renderClientDetail();

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Acme" })).toBeInTheDocument());

    for (const name of ["Overview", "Mentions", "Share of Voice", "Sentiment", "Recommendations"]) {
      expect(await screen.findByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(await screen.findByRole("heading", { level: 2, name: /Citation Sources/ })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: /AI Traffic Impact/ })).toBeInTheDocument();
  });

  it("keeps Runs, Prompt Collections, Reports, and Integrations as top-level nav buttons", async () => {
    renderClientDetail();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Acme" })).toBeInTheDocument());

    for (const label of ["Runs", "Prompt Collections", "Reports", "Integrations"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("shows a setup-incomplete banner listing what still needs to be configured", async () => {
    renderClientDetail();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Acme" })).toBeInTheDocument());

    expect(await screen.findByText(/Setup incomplete/i)).toBeInTheDocument();
    expect(screen.getByText("No competitor brands defined - AI Share of Voice will be meaningless")).toBeInTheDocument();
    expect(screen.getByText("No active prompt collection with prompts")).toBeInTheDocument();
  });

  it("links each setup-incomplete issue directly to the page where it's fixed", async () => {
    renderClientDetail();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Acme" })).toBeInTheDocument());

    const competitorLink = await screen.findByRole("link", {
      name: "No competitor brands defined - AI Share of Voice will be meaningless",
    });
    expect(competitorLink).toHaveAttribute("href", "/ai/clients/4");

    const promptsLink = screen.getByRole("link", { name: "No active prompt collection with prompts" });
    expect(promptsLink).toHaveAttribute("href", "/ai/clients/4/prompts");
  });

  it("does not render separate top-nav links for sections now shown inline", async () => {
    renderClientDetail();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Acme" })).toBeInTheDocument());

    for (const label of ["Overview", "Mentions", "Share of Voice", "Sentiment", "Sources", "Recommendations", "Traffic"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });
});
