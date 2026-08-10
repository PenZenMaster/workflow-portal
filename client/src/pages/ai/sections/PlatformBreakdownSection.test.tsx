import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { PlatformBreakdownSection } from "./PlatformBreakdownSection";

const CORE_BODY = {
  data: {
    platforms: [
      {
        platformId: 1, slug: "perplexity", displayName: "Perplexity", totalResponses: 10,
        citationCapable: true,
        mentionRate: 80, citationFrequency: 40, aiSoV: 60, avgVisibilityScore: 1.6,
        trustedThirdPartySupportRate: 30, clientOwnedCitationRate: 50, competitorOwnedCitationRate: 25,
      },
      // issue #35 slice 1: not citation-capable (its "citations" are just
      // regexed URLs out of free text, not a real provider feature) - the
      // citation-specific fields are null, not a misleading numeric value.
      {
        platformId: 4, slug: "anthropic", displayName: "Claude", totalResponses: 2,
        citationCapable: false,
        mentionRate: 50, citationFrequency: null, aiSoV: 50, avgVisibilityScore: 0.5,
        trustedThirdPartySupportRate: null, clientOwnedCitationRate: null, competitorOwnedCitationRate: null,
      },
    ],
    combined: {
      platformBalanced: {
        // Citation fields average only over citation-capable platforms -
        // perplexity alone, so these equal perplexity's own numbers.
        mentionRate: 65, citationFrequency: 40, aiSoV: 55, avgVisibilityScore: 1.05,
        trustedThirdPartySupportRate: 30, clientOwnedCitationRate: 50, competitorOwnedCitationRate: 25,
      },
      responseWeighted: {
        mentionRate: 75, citationFrequency: 41.7, aiSoV: 58.3, avgVisibilityScore: 1.46,
        trustedThirdPartySupportRate: 25, clientOwnedCitationRate: 55.6, competitorOwnedCitationRate: 20.8,
      },
    },
    defaultRollup: "platform_balanced",
    period: "30d",
  },
};

const NON_BRANDED_BODY = {
  data: {
    platforms: [
      {
        platformId: 1, slug: "perplexity", displayName: "Perplexity", nonBrandedResponses: 20,
        mentionRate: 40, recommendationRate: 25, strongRecommendationRate: 15, firstChoiceRate: 5,
        recommendationSoV: 25, rankDistribution: { avgRank: 2, medianRank: 2, rank1Frequency: 12.5, top3Frequency: 25, unrankedFrequency: 50, mentionedCount: 8 },
      },
    ],
    combined: {
      platformBalanced: {
        mentionRate: 40, recommendationRate: 25, strongRecommendationRate: 15, firstChoiceRate: 5,
        recommendationSoV: 25, rankDistribution: { avgRank: 2, medianRank: 2, rank1Frequency: 12.5, top3Frequency: 25, unrankedFrequency: 50, mentionedCount: 8 },
      },
      responseWeighted: {
        mentionRate: 40, recommendationRate: 25, strongRecommendationRate: 15, firstChoiceRate: 5,
        recommendationSoV: 25, rankDistribution: { avgRank: 2, medianRank: 2, rank1Frequency: 12.5, top3Frequency: 25, unrankedFrequency: 50, mentionedCount: 8 },
      },
    },
    defaultRollup: "platform_balanced",
    period: "30d",
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
let coreBody: unknown;
let nonBrandedBody: unknown;

beforeEach(() => {
  coreBody = CORE_BODY;
  nonBrandedBody = NON_BRANDED_BODY;
  fetchMock = vi.fn(async (url: string) => {
    const body = url.includes("non-branded") ? nonBrandedBody : coreBody;
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
      <PlatformBreakdownSection clientId="4" />
    </QueryClientProvider>
  );
}

describe("PlatformBreakdownSection", () => {
  it("renders per-platform core metric rows with sample size", async () => {
    renderSection();
    await waitFor(() => expect(screen.getAllByText("Perplexity").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Claude").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
  });

  it("renders the platform-balanced combined row and labels the response-weighted equivalent", async () => {
    renderSection();
    await waitFor(() => expect(screen.getAllByText("All Platforms").length).toBeGreaterThan(0));
    expect(screen.getAllByText(/platform-balanced/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/response-weighted/i).length).toBeGreaterThan(0);
  });

  it("renders per-platform non-branded/recommendation rows with avg rank", async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText("Strong Recommendation Rate")).toBeInTheDocument());
    expect(screen.getAllByText("2.0").length).toBeGreaterThan(0); // avgRank
  });

  it("renders the non-branded table's own empty state independently when it has no data", async () => {
    nonBrandedBody = { data: { platforms: [], combined: { platformBalanced: {}, responseWeighted: {} }, defaultRollup: "platform_balanced", period: "30d" } };
    renderSection();
    await waitFor(() => expect(screen.getByText("Perplexity")).toBeInTheDocument());
    expect(screen.getByText(/no non-branded platform data yet/i)).toBeInTheDocument();
  });

  it("renders a dash instead of a misleading percentage for a non-citation-capable platform's row", async () => {
    renderSection();
    await waitFor(() => expect(screen.getAllByText("Claude").length).toBeGreaterThan(0));
    const claudeRow = screen.getAllByText("Claude")[0].closest("tr");
    expect(claudeRow).not.toBeNull();
    // Claude (anthropic) is not citation-capable: citationFrequency,
    // trustedThirdPartySupportRate, clientOwnedCitationRate and
    // competitorOwnedCitationRate should all render as "-", not "0.0%" or
    // "NaN%", since a real numeric value would misrepresent a platform that
    // has no genuine citation support (issue #35 slice 1).
    expect(claudeRow!.textContent).not.toMatch(/NaN/);
    const withinRow = within(claudeRow as HTMLElement);
    expect(withinRow.getAllByText("-").length).toBe(4);
  });

  it("renders the platform-balanced rollup's citation fields as real numbers when at least one platform is citation-capable", async () => {
    renderSection();
    await waitFor(() => expect(screen.getAllByText("All Platforms").length).toBeGreaterThan(0));
    // platformBalanced citation fields are averaged only over
    // citation-capable platforms (perplexity alone in this fixture), so they
    // should still show a real percentage, not a dash.
    expect(screen.getAllByText("40.0%").length).toBeGreaterThan(0);
  });
});
