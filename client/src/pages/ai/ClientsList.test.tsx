import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

const API_RESPONSES: Record<string, unknown> = {
  "/api/auth/status": AUTH_STATUS,
  "/api/clients": { data: [] },
};

beforeEach(() => {
  const fetchMock = vi.fn(async (url: string) => {
    const body = API_RESPONSES[url] ?? { data: null };
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

describe("ClientsList — Back to Workflows positioning", () => {
  it("places Back to Workflows in its own row above the Clients heading, not beside New Client", async () => {
    renderClientsList();

    const backLink = await screen.findByRole("link", { name: /Back to Workflows/i });
    const heading = screen.getByRole("heading", { name: "Clients" });

    // Back link must come before the Clients heading in document order.
    expect(
      backLink.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Back link must not share a row with the heading/New Client button.
    expect(backLink.parentElement).not.toBe(heading.parentElement);
  });
});
