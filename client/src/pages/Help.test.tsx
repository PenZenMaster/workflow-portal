import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import Help from "./Help";

const DOC_CONTENT = `# Workflow Portal — System Documentation

## Section 1: Recommended Setup Order

Some intro text.

### 1A. Global Application Settings

Sub-section content.

## Section 2: Data Sources and Formulas

More content.
`;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/help/system-documentation")) {
        return { ok: true, status: 200, json: async () => ({ data: { content: DOC_CONTENT } }), text: async () => "" } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "" } as Response;
    })
  );
});

function renderHelp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Help />
    </QueryClientProvider>
  );
}

describe("Help page", () => {
  it("fetches and renders the doc's markdown content", async () => {
    renderHelp();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Section 1: Recommended Setup Order/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/Some intro text\./)).toBeInTheDocument();
  });

  it("builds a section nav from the doc's own ## and ### headings, and clicking a nav entry scrolls to the matching heading (not a hash route change)", async () => {
    const user = userEvent.setup();
    renderHelp();
    await waitFor(() => expect(screen.getAllByText(/Section 1: Recommended Setup Order/i).length).toBeGreaterThan(0));

    // Real navigable links here would break this app's hash-based router
    // (clicking "#some-slug" is interpreted as a route change, not an
    // in-page anchor - the exact bug reported in production). Nav entries
    // must be buttons that scroll, not links.
    const navButton = screen.getByRole("button", { name: /Section 1: Recommended Setup Order/i });
    const heading = screen.getByRole("heading", { name: /Section 1: Recommended Setup Order/i });
    const scrollSpy = vi.fn();
    heading.scrollIntoView = scrollSpy;

    await user.click(navButton);

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth" });
  });

  it("includes a nav entry for a sub-section heading (###) as well as top-level (##)", async () => {
    renderHelp();
    await waitFor(() => expect(screen.getAllByText(/1A\. Global Application Settings/i).length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: /1A\. Global Application Settings/i })).toBeInTheDocument();
  });

  it("renders a markdown table (GFM) correctly via remark-gfm", async () => {
    const withTable = `# Doc

## Table Section

| Col A | Col B |
|-------|-------|
| 1     | 2     |
`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { content: withTable } }),
        text: async () => "",
      })) as unknown as typeof fetch
    );
    renderHelp();
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.getByRole("columnheader", { name: "Col A" })).toBeInTheDocument();
  });
});
