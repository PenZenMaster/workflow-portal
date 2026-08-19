import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { SoVSection } from "./SoVSection";

const SOV = {
  data: { aiSoV: 42.5, clientMentions: 17, allBrandMentions: 40, fromDate: "2026-07-01", toDate: "2026-08-01" },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => SOV, text: async () => "" }) as Response)
  );
});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SoVSection clientId="4" />
    </QueryClientProvider>
  );
}

describe("SoVSection", () => {
  it("renders the AI SoV percentage", async () => {
    renderSection();
    expect(await screen.findByText(/42\.5/)).toBeInTheDocument();
  });

  it("scrolls to the mentions-section element when the view-mentions link is clicked", async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText(/42\.5/)).toBeInTheDocument());

    const target = document.createElement("div");
    target.id = "mentions-section";
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;
    document.body.appendChild(target);

    await user.click(screen.getByRole("button", { name: /view mentions/i }));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth" });
    document.body.removeChild(target);
  });
});
