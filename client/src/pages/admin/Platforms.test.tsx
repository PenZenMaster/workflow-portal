import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import Platforms from "./Platforms";

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "agency_admin" as const },
  config: {
    perplexityConfigured: true,
    googleOAuthConfigured: false,
    configuredPlatforms: ["perplexity", "openai"],
  },
};

const PLATFORMS = [
  { id: 1, slug: "perplexity", displayName: "Perplexity", enabled: true, config: {} },
  { id: 3, slug: "openai", displayName: "ChatGPT (OpenAI)", enabled: true, config: {} },
  { id: 4, slug: "anthropic", displayName: "Claude (Anthropic)", enabled: false, config: {} },
];

const API_RESPONSES: Record<string, unknown> = {
  "/api/auth/status": AUTH_STATUS,
  "/api/platforms": { data: PLATFORMS },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "PATCH" && url === "/api/platforms/4") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { ...PLATFORMS[2], enabled: true } }),
        text: async () => "",
      } as Response;
    }

    if (method === "DELETE" && url === "/api/platforms/3") {
      return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
    }

    const body = API_RESPONSES[url] ?? { data: null };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderPlatforms() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Platforms />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Platforms (AI Platforms admin page)", () => {
  it("renders the platform list with Connected / Not configured badges", async () => {
    renderPlatforms();

    expect(await screen.findByText("Perplexity")).toBeInTheDocument();
    expect(await screen.findByText("ChatGPT (OpenAI)")).toBeInTheDocument();
    expect(await screen.findByText("Claude (Anthropic)")).toBeInTheDocument();

    const connectedBadges = await screen.findAllByText("Connected");
    expect(connectedBadges).toHaveLength(2);

    expect(await screen.findByText("Not configured")).toBeInTheDocument();
  });

  it("toggling the enabled switch sends a PATCH request", async () => {
    renderPlatforms();
    await screen.findByText("Claude (Anthropic)");

    const toggle = screen.getByRole("switch", { name: /Claude \(Anthropic\)/i });
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/platforms/4",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ enabled: true }),
        }),
      ),
    );
  });

  it("deleting a platform sends a DELETE request and removes it from the list", async () => {
    renderPlatforms();
    await screen.findByText("ChatGPT (OpenAI)");

    const deleteButton = screen.getByRole("button", { name: /Delete ChatGPT \(OpenAI\)/i });
    await userEvent.click(deleteButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/platforms/3",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});
