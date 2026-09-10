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
    actionableIssues: [],
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
    actionableIssues: [
      { message: "No competitor brands defined - AI Share of Voice will be meaningless", href: "/ai/clients/2" },
      { message: "No active prompt collection with prompts", href: "/ai/clients/2/prompts" },
    ],
  },
];

const ARCHIVED_CLIENTS = [
  { id: 3, name: "Gamma LLC", primaryDomain: "gamma.com", geographies: [], exclusions: [], ownerUserId: null, createdAt: 0, updatedAt: 0 },
];

let clientsResponse: unknown;
let readinessResponse: unknown;
let archivedResponse: unknown;

const API_RESPONSES: Record<string, () => unknown> = {
  "/api/auth/status": () => AUTH_STATUS,
  "/api/clients": () => clientsResponse,
  "/api/clients/readiness": () => readinessResponse,
  "/api/clients/archived": () => archivedResponse,
  "/api/clients/3/permanent": () => ({ data: null }),
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clientsResponse = { data: [] };
  readinessResponse = { data: [] };
  archivedResponse = { data: [] };

  fetchMock = vi.fn(async (url: string) => {
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

  it("renders each setup issue as a link to the page where it's fixed", async () => {
    clientsResponse = { data: CLIENTS };
    readinessResponse = { data: READINESS };

    renderClientsList();

    await userEvent.click(await screen.findByText(/Setup incomplete/i));

    const competitorLink = screen.getByRole("link", {
      name: "No competitor brands defined - AI Share of Voice will be meaningless",
    });
    expect(competitorLink).toHaveAttribute("href", "/ai/clients/2");

    const promptsLink = screen.getByRole("link", { name: "No active prompt collection with prompts" });
    expect(promptsLink).toHaveAttribute("href", "/ai/clients/2/prompts");
  });
});

describe("ClientsList — archive / restore", () => {
  it("archives a client via its Archive button", async () => {
    clientsResponse = { data: CLIENTS };
    readinessResponse = { data: READINESS };

    renderClientsList();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByRole("button", { name: /archive acme corp/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clients/1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("shows archived clients when the archived-clients toggle is opened, with a Restore action", async () => {
    clientsResponse = { data: CLIENTS };
    readinessResponse = { data: READINESS };
    archivedResponse = { data: ARCHIVED_CLIENTS };

    renderClientsList();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByRole("button", { name: /view archived clients/i }));

    expect(await screen.findByText("Gamma LLC")).toBeInTheDocument();
    const restoreButton = screen.getByRole("button", { name: /restore gamma llc/i });

    await userEvent.click(restoreButton);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clients/3/restore",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("keeps the permanent-delete confirm button disabled until the typed name matches exactly", async () => {
    clientsResponse = { data: CLIENTS };
    readinessResponse = { data: READINESS };
    archivedResponse = { data: ARCHIVED_CLIENTS };

    renderClientsList();
    await screen.findByText("Acme Corp");
    await userEvent.click(screen.getByRole("button", { name: /view archived clients/i }));
    await screen.findByText("Gamma LLC");

    await userEvent.click(screen.getByRole("button", { name: /delete gamma llc permanently/i }));

    const confirmButton = screen.getByRole("button", { name: /permanently delete/i });
    expect(confirmButton).toBeDisabled();

    const nameInput = screen.getByLabelText(/type the client name to confirm/i);
    await userEvent.type(nameInput, "Gamma L");
    expect(confirmButton).toBeDisabled();

    await userEvent.type(nameInput, "LC");
    expect(confirmButton).not.toBeDisabled();
  });

  it("permanently deletes once the exact name is typed and confirmed", async () => {
    clientsResponse = { data: CLIENTS };
    readinessResponse = { data: READINESS };
    archivedResponse = { data: ARCHIVED_CLIENTS };

    renderClientsList();
    await screen.findByText("Acme Corp");
    await userEvent.click(screen.getByRole("button", { name: /view archived clients/i }));
    await screen.findByText("Gamma LLC");

    await userEvent.click(screen.getByRole("button", { name: /delete gamma llc permanently/i }));
    await userEvent.type(screen.getByLabelText(/type the client name to confirm/i), "Gamma LLC");
    await userEvent.click(screen.getByRole("button", { name: /permanently delete/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clients/3/permanent",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ confirmName: "Gamma LLC" }),
      })
    );
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
