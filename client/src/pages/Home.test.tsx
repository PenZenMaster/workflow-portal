import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import Home from "./Home";

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "analyst" as const },
  config: {
    perplexityConfigured: true,
    googleOAuthConfigured: false,
    configuredPlatforms: ["perplexity"],
  },
};

const API_RESPONSES: Record<string, unknown> = {
  "/api/auth/status": AUTH_STATUS,
  "/api/workflows": [],
};

beforeEach(() => {
  const fetchMock = vi.fn(async (url: string) => {
    const body = API_RESPONSES[url] ?? { data: null };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Home />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("Home — top nav", () => {
  it("shows a Clients link to /ai/clients", async () => {
    renderHome();

    const link = await screen.findByRole("link", { name: /^Clients$/i });
    expect(link).toHaveAttribute("href", "/ai/clients");
  });

  it("shows a What We Do link to /guides/index.html", async () => {
    renderHome();

    const link = await screen.findByRole("link", { name: /^What We Do$/i });
    expect(link).toHaveAttribute("href", "/guides/index.html");
  });
});
