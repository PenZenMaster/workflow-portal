import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import SourceDomains from "./SourceDomains";

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "agency_admin" as const },
  config: { perplexityConfigured: true, googleOAuthConfigured: false, configuredPlatforms: [] },
};

const UNREVIEWED = [
  { rootDomain: "newblog.example.com", citationCount: 12 },
  { rootDomain: "rareforum.example.com", citationCount: 2 },
];

const REGISTRY = [
  {
    id: 1,
    rootDomain: "yelp.com",
    sourceClass: "review_platform" as const,
    rationale: "Consumer review platform",
    classifiedBy: "seed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const API_RESPONSES: Record<string, unknown> = {
  "/api/auth/status": AUTH_STATUS,
  "/api/source-domains/unreviewed": { data: UNREVIEWED },
  "/api/source-domains": { data: REGISTRY },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "PUT" && url === "/api/source-domains/newblog.example.com") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 9,
            rootDomain: "newblog.example.com",
            sourceClass: payload.sourceClass,
            rationale: payload.rationale,
            classifiedBy: "user:1",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        }),
        text: async () => "",
      } as Response;
    }

    if (method === "PUT" && url === "/api/source-domains/yelp.com") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { ...REGISTRY[0], sourceClass: payload.sourceClass, rationale: payload.rationale } }),
        text: async () => "",
      } as Response;
    }

    const body = API_RESPONSES[url] ?? { data: null };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SourceDomains />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("SourceDomains admin page (B-27)", () => {
  it("renders the unreviewed queue sorted by citation count", async () => {
    renderPage();
    expect(await screen.findByText("newblog.example.com")).toBeInTheDocument();
    expect(screen.getByText("rareforum.example.com")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders the registry list", async () => {
    renderPage();
    expect(await screen.findByText("yelp.com")).toBeInTheDocument();
    expect(screen.getByText("Consumer review platform")).toBeInTheDocument();
  });

  it("classifying an unreviewed domain PUTs sourceClass and rationale", async () => {
    renderPage();
    await screen.findByText("newblog.example.com");

    const select = screen.getByLabelText(/Classify newblog.example.com/i);
    await userEvent.selectOptions(select, "industry_authority");
    await userEvent.type(
      screen.getByLabelText(/Rationale for newblog.example.com/i),
      "Established SEO industry publication"
    );
    await userEvent.click(screen.getByRole("button", { name: /Save newblog.example.com/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/source-domains/newblog.example.com",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            sourceClass: "industry_authority",
            rationale: "Established SEO industry publication",
          }),
        })
      )
    );
  });

  it("disables Save until a rationale is entered", async () => {
    renderPage();
    await screen.findByText("newblog.example.com");

    expect(screen.getByRole("button", { name: /Save newblog.example.com/i })).toBeDisabled();
  });

  it("filtering the registry by class refetches with the class query param", async () => {
    renderPage();
    await screen.findByText("yelp.com");

    await userEvent.selectOptions(screen.getByLabelText(/Filter by class/i), "review_platform");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/source-domains\?class=review_platform/),
        expect.objectContaining({ credentials: "include" })
      )
    );
  });

  it("reclassifying an existing registry entry PUTs the update", async () => {
    renderPage();
    await screen.findByText("yelp.com");

    await userEvent.click(screen.getByRole("button", { name: /Edit yelp.com/i }));
    const rationaleInput = screen.getByDisplayValue("Consumer review platform");
    await userEvent.clear(rationaleInput);
    await userEvent.type(rationaleInput, "Updated rationale");
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/source-domains/yelp.com",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ sourceClass: "review_platform", rationale: "Updated rationale" }),
        })
      )
    );
  });
});
