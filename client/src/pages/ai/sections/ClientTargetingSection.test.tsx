import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Client } from "@shared/schema";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClientTargetingSection } from "./ClientTargetingSection";

let role: string;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ status: { user: { id: 1, username: "u", email: null, role } } }),
}));

const CLIENT: Client = {
  id: 4,
  name: "Acme",
  primaryDomain: "acme.com",
  geographies: ["Seattle"],
  exclusions: ["jobs"],
  coreServices: ["scrap metal pickup"],
  ownerUserId: 7,
  rankrocketSiteKey: "acme-site",
  gbpLocationName: "locations/123",
  createdAt: 0,
  updatedAt: 0,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  role = "agency_admin";
  fetchMock = vi.fn(async () => {
    const body = { data: CLIENT };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderSection(client: Client = CLIENT) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ClientTargetingSection client={client} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function patchBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
  expect(call).toBeDefined();
  return JSON.parse((call![1] as RequestInit).body as string) as Record<string, unknown>;
}

describe("ClientTargetingSection", () => {
  it("shows the existing core services, geographies and exclusions as chips", () => {
    renderSection();
    expect(screen.getByRole("heading", { level: 2, name: "Targeting" })).toBeInTheDocument();
    expect(screen.getByText("scrap metal pickup")).toBeInTheDocument();
    expect(screen.getByText("Seattle")).toBeInTheDocument();
    expect(screen.getByText("jobs")).toBeInTheDocument();
  });

  it("saves an added core service and preserves every other client field (PATCH is a full replace)", async () => {
    renderSection();

    await userEvent.type(screen.getByLabelText("Add core service"), "auto scrap metal recycling");
    await userEvent.click(screen.getByRole("button", { name: "Add core service to list" }));
    await userEvent.click(screen.getByRole("button", { name: /save targeting/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("/api/clients/4");
    expect(patchBody()).toEqual({
      name: "Acme",
      primaryDomain: "acme.com",
      geographies: ["Seattle"],
      exclusions: ["jobs"],
      coreServices: ["scrap metal pickup", "auto scrap metal recycling"],
      ownerUserId: 7,
      rankrocketSiteKey: "acme-site",
      gbpLocationName: "locations/123",
    });
  });

  it("adds an entry when Enter is pressed in the input", async () => {
    renderSection();
    await userEvent.type(screen.getByLabelText("Add geography"), "Tacoma{Enter}");
    expect(screen.getByText("Tacoma")).toBeInTheDocument();
  });

  it("removes a chip and saves the shortened list", async () => {
    renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Remove scrap metal pickup" }));
    await userEvent.click(screen.getByRole("button", { name: /save targeting/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(patchBody().coreServices).toEqual([]);
  });

  it("rejects blank and case/space-insensitive duplicate entries", async () => {
    renderSection();

    await userEvent.type(screen.getByLabelText("Add core service"), "   {Enter}");
    await userEvent.type(screen.getByLabelText("Add core service"), "  Scrap  Metal PICKUP {Enter}");

    expect(screen.getAllByText(/scrap metal pickup/i)).toHaveLength(1);
  });

  it("disables Save until something changes", async () => {
    renderSection();
    expect(screen.getByRole("button", { name: /save targeting/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Add exclusion"), "careers{Enter}");
    expect(screen.getByRole("button", { name: /save targeting/i })).toBeEnabled();
  });

  it("is read-only for roles outside super_admin / agency_admin", () => {
    role = "analyst";
    renderSection();

    expect(screen.getByText("scrap metal pickup")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add core service")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save targeting/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove scrap metal pickup" })).not.toBeInTheDocument();
  });
});
