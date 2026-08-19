import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { queryClient } from "@/lib/queryClient";

const API_RESPONSES: Record<string, unknown> = {
  "/api/auth/status": {
    needsSetup: false,
    authenticated: true,
    user: { id: 1, username: "admin", email: null, role: "analyst" },
    config: { perplexityConfigured: true, googleOAuthConfigured: false, configuredPlatforms: ["perplexity"] },
  },
  "/api/workflows": [],
  "/api/clients/readiness": { data: [] },
  "/api/clients": { data: [] },
};

beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = API_RESPONSES[url] ?? { data: null };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    })
  );
});

afterEach(() => {
  window.location.hash = "";
});

describe("App — global Help link", () => {
  it("shows a Help link even on a page that has no Help link of its own (proves it's global, not Home's own nav link)", async () => {
    window.location.hash = "#/ai/clients";
    render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Clients" });
    const help = screen.getByRole("link", { name: /^help$/i });
    expect(help).toHaveAttribute("href", "#/help");
  });

  it("does not show the global Help link before authentication resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) // never resolves — still loading
    );
    render(<App />);

    expect(screen.queryByRole("link", { name: /help/i })).not.toBeInTheDocument();
  });
});
