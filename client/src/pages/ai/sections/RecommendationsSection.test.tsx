import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { RecommendationsSection } from "./RecommendationsSection";

function makeRecs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    kind: `gap-${i}`,
    severity: "medium" as const,
    evidence: `Evidence ${i}`,
    suggestedAction: `Action ${i}`,
  }));
}

function stubRecs(recs: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: recs }), text: async () => "" }) as Response)
  );
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RecommendationsSection clientId="4" />
    </QueryClientProvider>
  );
}

describe("RecommendationsSection — compact cap", () => {
  it("shows all recommendations with no expand control when there are 3 or fewer", async () => {
    stubRecs(makeRecs(3));
    renderSection();
    expect(await screen.findByText("Evidence 0")).toBeInTheDocument();
    expect(screen.getByText("Evidence 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show all/i })).not.toBeInTheDocument();
  });

  it("caps to the first 3 and shows a 'Show all N' control when there are more than 3", async () => {
    stubRecs(makeRecs(5));
    renderSection();
    expect(await screen.findByText("Evidence 0")).toBeInTheDocument();
    expect(screen.getByText("Evidence 2")).toBeInTheDocument();
    expect(screen.queryByText("Evidence 3")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show all 5/i })).toBeInTheDocument();
  });

  it("expands to show all, then collapses back on Show less", async () => {
    stubRecs(makeRecs(5));
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText("Evidence 0")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /show all 5/i }));
    expect(screen.getByText("Evidence 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show less/i }));
    expect(screen.queryByText("Evidence 4")).not.toBeInTheDocument();
  });
});
