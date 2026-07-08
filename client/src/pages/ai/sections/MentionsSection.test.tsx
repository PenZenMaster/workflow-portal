import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { MentionsSection } from "./MentionsSection";

function makeMentions(count: number) {
  // Newest first, matching the server's ordering.
  return Array.from({ length: count }, (_, i) => ({
    id: count - i,
    responseId: 1,
    brandId: 1,
    matchedText: `Mention ${count - i}`,
    matchType: "exact",
    section: "body",
    recommendationRank: null,
    confidence: 1,
    evidenceExcerpt: null,
  }));
}

let fetchMock: ReturnType<typeof vi.fn>;
let totalMentions: number;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const match = /\/api\/clients\/4\/mentions\?limit=(\d+)/.exec(url);
    const limit = match ? Number(match[1]) : totalMentions;
    const mentions = makeMentions(totalMentions).slice(0, limit);
    const body = { data: { mentions, total: totalMentions } };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MentionsSection clientId="4" />
    </QueryClientProvider>
  );
}

describe("MentionsSection pagination", () => {
  it("renders all mentions without Show more when total fits one page", async () => {
    totalMentions = 3;
    renderSection();
    await waitFor(() => expect(screen.getByText("Mention 3")).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument();
  });

  it("shows the first 20 with a count label and loads the next page on Show more", async () => {
    totalMentions = 25;
    renderSection();
    await waitFor(() => expect(screen.getByText("Mention 25")).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByText(/showing 20 of 25/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show more/i }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(25));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clients/4/mentions?limit=40",
      expect.anything()
    );
    expect(screen.getByText(/showing 25 of 25/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  it("collapses back to the first page on Show less", async () => {
    totalMentions = 25;
    renderSection();
    await waitFor(() => expect(screen.getByText("Mention 25")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /show more/i }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(25));

    await userEvent.click(screen.getByRole("button", { name: /show less/i }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(20));
    expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument();
  });
});
