import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import Integrations from "./Integrations";

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ id: "4" }) };
});

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "agency_admin" as const },
  config: {
    perplexityConfigured: true,
    googleOAuthConfigured: true,
    configuredPlatforms: ["perplexity"],
  },
};

const GA4_INTEGRATION = {
  id: 1,
  clientId: 4,
  kind: "ga4",
  config: { propertyId: "", connectedEmail: "user@example.com" },
  status: "active",
  lastSyncedAt: null,
  lastError: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const PLATFORMS = [
  { id: 1, slug: "perplexity", displayName: "Perplexity", enabled: true, config: {} },
  { id: 2, slug: "openai", displayName: "ChatGPT (OpenAI)", enabled: true, config: {} },
  { id: 3, slug: "anthropic", displayName: "Claude (Anthropic)", enabled: true, config: {} },
  { id: 4, slug: "gemini", displayName: "Gemini (Google)", enabled: true, config: {} },
  { id: 5, slug: "groq", displayName: "Llama via Groq", enabled: true, config: {} },
  { id: 6, slug: "mistral", displayName: "Mistral", enabled: true, config: {} },
  { id: 7, slug: "deepseek", displayName: "DeepSeek", enabled: true, config: {} },
];

const PROPERTIES_URL = "/api/clients/4/integrations/1/ga4/properties";

const PROPERTY_LIST = [
  { propertyId: "111111111", displayName: "Acme - Main Site", accountName: "Acme Inc" },
  { propertyId: "222222222", displayName: "Acme - Blog", accountName: "Acme Inc" },
];

let fetchMock: ReturnType<typeof vi.fn>;
let propertiesResponse: unknown;

beforeEach(() => {
  propertiesResponse = { data: { properties: PROPERTY_LIST } };

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "PATCH" && url === "/api/integrations/1/property") {
      return { ok: true, status: 200, json: async () => ({ data: { ok: true, propertyId: "111111111" } }), text: async () => "" } as Response;
    }

    if (url === "/api/auth/status") {
      return { ok: true, status: 200, json: async () => AUTH_STATUS, text: async () => JSON.stringify(AUTH_STATUS) } as Response;
    }

    if (url === "/api/clients/4/integrations") {
      const body = { data: [GA4_INTEGRATION] };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    }

    if (url === "/api/clients/4") {
      const body = {
        data: {
          id: 4,
          name: "Camp House Country Landscaping",
          primaryDomain: "camphousecountrylandscaping.com",
          geographies: [],
          exclusions: [],
          ownerUserId: null,
          createdAt: 0,
          updatedAt: 0,
        },
      };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    }

    if (url === PROPERTIES_URL) {
      return { ok: true, status: 200, json: async () => propertiesResponse, text: async () => JSON.stringify(propertiesResponse) } as Response;
    }

    if (url === "/api/platforms") {
      const body = { data: PLATFORMS };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    }

    return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "{}" } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
});

function renderIntegrations() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Integrations />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Integrations — GA4 property picker", () => {
  it("renders a property dropdown populated from the GA4 properties endpoint and saves on selection", async () => {
    renderIntegrations();

    const select = await screen.findByRole("combobox", { name: /GA4 Property/i });
    expect(screen.getByText(/Acme - Main Site/)).toBeInTheDocument();
    expect(screen.getByText(/Acme - Blog/)).toBeInTheDocument();

    await userEvent.selectOptions(select, "111111111");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/1/property",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ propertyId: "111111111" }),
        }),
      ),
    );
  });

  it("falls back to manual entry when the properties endpoint returns none", async () => {
    propertiesResponse = { data: { properties: [], error: "GA4 Admin API error (403): forbidden" } };
    renderIntegrations();

    expect(await screen.findByText(/Couldn't load your GA4 properties automatically/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /GA4 Property/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set property ID" })).toBeInTheDocument();
  });

  it("the Enter ID manually toggle switches from the dropdown to manual entry", async () => {
    renderIntegrations();

    await screen.findByRole("combobox", { name: /GA4 Property/i });

    await userEvent.click(screen.getByRole("button", { name: /Enter ID manually/i }));

    expect(screen.queryByRole("combobox", { name: /GA4 Property/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set property ID" })).toBeInTheDocument();
  });
});

describe("Integrations — breadcrumbs (B-17)", () => {
  it("shows the client name in the breadcrumb trail linking back to the client", async () => {
    renderIntegrations();

    const clientCrumb = await screen.findByRole("link", {
      name: "Camp House Country Landscaping",
    });
    expect(clientCrumb).toHaveAttribute("href", "/ai/clients/4");

    const current = screen.getByText("Integrations & API Keys", {
      selector: "[aria-current='page']",
    });
    expect(current).toBeInTheDocument();

    expect(
      screen.queryByRole("link", { name: /Back to Client/i })
    ).not.toBeInTheDocument();
  });
});

describe("Integrations — AI platform API key status", () => {
  it("shows Connected/Not configured badges for all catalog platforms", async () => {
    renderIntegrations();

    expect(await screen.findByText("Perplexity")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT (OpenAI)")).toBeInTheDocument();
    expect(screen.getByText("Claude (Anthropic)")).toBeInTheDocument();
    expect(screen.getByText("Gemini (Google)")).toBeInTheDocument();
    expect(screen.getByText("Llama via Groq")).toBeInTheDocument();
    expect(screen.getByText("Mistral")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured")).toHaveLength(6);
  });

  it("shows the env-var setup hint for a not-configured platform", async () => {
    renderIntegrations();

    await screen.findByText("Claude (Anthropic)");

    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
  });
});
