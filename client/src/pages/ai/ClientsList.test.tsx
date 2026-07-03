import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import ClientsList from "./ClientsList";

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "agency_admin" as const },
  config: {
    perplexityConfigured: true,
    googleOAuthConfigured: false,
    configuredPlatforms: ["perplexity"],
  },
};

const CLIENTS = [
  { id: 1, name: "Acme Corp", primaryDomain: "acme.com", geographies: [], exclusions: [], ownerUserId: null, createdAt: 0, updatedAt: 0 },
  { id: 2, name: "Beta Inc", primaryDomain: "beta.com", geographies: [], exclusions: [], ownerUserId: null, createdAt: 0, updatedAt: 0 },
];

const READINESS = [
  {
    clientId: 1,
    hasClientBrand: true,
    competitorBrandCount: 1,
    competitorBrandsWithAliasCount: 1,
    hasActivePromptCollectionWithPrompts: true,
    ready: true,
    issues: [],
  },
  {
    clientId: 2,
    hasClientBrand: true,
    competitorBrandCount: 0,
    competitorBrandsWithAliasCount: 0,
    hasActivePromptCollectionWithPrompts: false,
    ready: false,
    issues: [
      "No competitor brands defined - AI Share of Voice will be meaningless",
      "No active prompt collection with prompts",
    ],
  },
];

let clientsResponse: unknown;
let readinessResponse: unknown;

const API_RESPONSES: Record<string, () => unknown> = {
  "/api/auth/status": () => AUTH_STATUS,
  "/api/clients": () => clientsResponse,
  "/api/clients/readiness": () => readinessResponse,
};

beforeEach(() => {
  clientsResponse = { data: [] };
  readinessResponse = { data: [] };

  const fetchMock = vi.fn(async (url: string) => {
    const body = API_RESPONSES[url] ? API_RESPONSES[url]() : { data: null };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderClientsList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ClientsList />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ClientsList — readiness badges", () => {
  it("shows a Ready badge for a fully configured client and Setup incomplete for one with issues", async () => {
    clientsResponse = { data: CLIENTS };
    readinessResponse = { data: READINESS };

    renderClientsList();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();

    expect(screen.getByText(/Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Setup incomplete/i)).toBeInTheDocument();

    await userEvent.click(screen.getByText(/Setup incomplete/i));
    expect(screen.getByText("No competitor brands defined - AI Share of Voice will be meaningless")).toBeInTheDocument();
    expect(screen.getByText("No active prompt collection with prompts")).toBeInTheDocument();
  });
});

describe("ClientsList — breadcrumbs", () => {
  it("renders a breadcrumb trail (Workflows link + Clients as current page) instead of a Back link", async () => {
    renderClientsList();

    const nav = await screen.findByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();

    const workflows = screen.getByRole("link", { name: "Workflows" });
    expect(workflows).toHaveAttribute("href", "/");

    const current = screen.getByText("Clients", { selector: "[aria-current='page']" });
    expect(current).toBeInTheDocument();

    expect(
      screen.queryByRole("link", { name: /Back to Workflows/i })
    ).not.toBeInTheDocument();
  });
});
