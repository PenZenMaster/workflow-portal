import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { TokenUsageSection } from "./TokenUsageSection";

let fetchMock: ReturnType<typeof vi.fn>;
let apiStatus: number;
let apiBody: unknown;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: apiStatus >= 200 && apiStatus < 300,
    status: apiStatus,
    json: async () => apiBody,
    text: async () => JSON.stringify(apiBody),
  }) as Response);
  vi.stubGlobal("fetch", fetchMock);
});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TokenUsageSection clientId="4" />
    </QueryClientProvider>
  );
}

describe("TokenUsageSection", () => {
  it("renders per-platform token rows and totals", async () => {
    apiStatus = 200;
    apiBody = {
      data: {
        totalInputTokens: 35,
        totalOutputTokens: 350,
        byPlatform: [
          { platformId: 1, platformSlug: "openai", responses: 2, inputTokens: 30, outputTokens: 300 },
          { platformId: 2, platformSlug: "mistral", responses: 1, inputTokens: 5, outputTokens: 50 },
        ],
        period: "30d",
      },
    };
    renderSection();

    await waitFor(() => expect(screen.getByText("openai")).toBeInTheDocument());
    expect(screen.getByText("mistral")).toBeInTheDocument();
    expect(screen.getByText(/35 in \/ 350 out/)).toBeInTheDocument();
  });

  it("renders nothing when the endpoint denies access (client_viewer)", async () => {
    apiStatus = 403;
    apiBody = { error: "Forbidden" };
    const { container } = renderSection();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
