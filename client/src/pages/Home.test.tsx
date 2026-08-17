import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import Home from "./Home";

function authStatus(role: "analyst" | "agency_admin" = "analyst") {
  return {
    needsSetup: false,
    authenticated: true,
    user: { id: 1, username: "admin", email: null, role },
    config: {
      perplexityConfigured: true,
      googleOAuthConfigured: false,
      configuredPlatforms: ["perplexity"],
    },
  };
}

let currentRole: "analyst" | "agency_admin" = "analyst";

beforeEach(() => {
  currentRole = "analyst";
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/auth/status") {
      const body = authStatus(currentRole);
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    }
    if (url === "/api/workflows") {
      return { ok: true, status: 200, json: async () => [], text: async () => "[]" } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "" } as Response;
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

  // B-25
  it("shows a Help link to /help", async () => {
    renderHome();

    const link = await screen.findByRole("link", { name: /^Help$/i });
    expect(link).toHaveAttribute("href", "/help");
  });

  // RankRocket Site Insights admin CRUD
  it("shows a RankRocket Site Insights admin link to /admin/rankrocket-site-insights for agency_admin", async () => {
    currentRole = "agency_admin";
    renderHome();

    const link = await screen.findByRole("link", { name: /RankRocket Site Insights/i });
    expect(link).toHaveAttribute("href", "/admin/rankrocket-site-insights");
  });

  it("does not show the RankRocket Site Insights admin link for a non-admin role", async () => {
    renderHome();
    await screen.findByRole("link", { name: /^Clients$/i });

    expect(screen.queryByRole("link", { name: /RankRocket Site Insights/i })).not.toBeInTheDocument();
  });
});
