import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Client } from "@shared/schema";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClientTargetingSection } from "./ClientTargetingSection";

let role: string;
let patchOk: boolean;

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
  patchOk = true;
  fetchMock = vi.fn(async () => {
    const body = patchOk ? { data: CLIENT } : { error: "boom" };
    return {
      ok: patchOk,
      status: patchOk ? 200 : 500,
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

function patchCalls(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
}

describe("ClientTargetingSection", () => {
  it("shows each list as its own titled group with a count and one row per item", () => {
    renderSection();

    expect(screen.getByRole("heading", { level: 2, name: "Targeting" })).toBeInTheDocument();
    for (const [name, item] of [
      ["Core services", "scrap metal pickup"],
      ["Geographies", "Seattle"],
      ["Exclusions", "jobs"],
    ]) {
      const group = screen.getByRole("group", { name: new RegExp(name) });
      expect(within(group).getByText(/\(1\)/)).toBeInTheDocument();
      expect(within(group).getByRole("listitem")).toHaveTextContent(item);
    }
  });

  it("has no Save button - changes save as they are made", () => {
    renderSection();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("adds an item immediately, shows it, and sends the full client record", async () => {
    renderSection();

    await userEvent.type(screen.getByLabelText("New core service"), "auto scrap metal recycling");
    await userEvent.click(screen.getByRole("button", { name: "Add core service" }));

    const group = screen.getByRole("group", { name: /Core services/ });
    expect(within(group).getByText("auto scrap metal recycling")).toBeInTheDocument();
    expect(screen.getByLabelText("New core service")).toHaveValue("");

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(fetchMock.mock.calls[0][0]).toContain("/api/clients/4");
    expect(patchCalls()[0]).toEqual({
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

  it("adds an item when Enter is pressed", async () => {
    renderSection();
    await userEvent.type(screen.getByLabelText("New geography"), "Tacoma{Enter}");

    expect(within(screen.getByRole("group", { name: /Geographies/ })).getByText("Tacoma")).toBeInTheDocument();
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0].geographies).toEqual(["Seattle", "Tacoma"]);
  });

  it("removes an item immediately and saves the shortened list", async () => {
    renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Remove exclusion jobs" }));

    expect(screen.queryByText("jobs")).not.toBeInTheDocument();
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0].exclusions).toEqual([]);
  });

  it("does not save blank input, and tells the user about a duplicate", async () => {
    renderSection();

    await userEvent.type(screen.getByLabelText("New core service"), "   {Enter}");
    await userEvent.type(screen.getByLabelText("New core service"), "  Scrap  Metal PICKUP {Enter}");

    expect(screen.getByText(/already in the list/i)).toBeInTheDocument();
    expect(screen.getAllByText(/scrap metal pickup/i)).toHaveLength(1);
    expect(patchCalls()).toHaveLength(0);
  });

  it("puts the item back and reports the failure when the save fails", async () => {
    patchOk = false;
    renderSection();

    await userEvent.type(screen.getByLabelText("New exclusion"), "careers{Enter}");

    await waitFor(() => expect(screen.queryByText("careers")).not.toBeInTheDocument());
    expect(screen.getByText("jobs")).toBeInTheDocument();
  });

  it("is read-only for roles outside super_admin / agency_admin", () => {
    role = "analyst";
    renderSection();

    expect(screen.getByText("scrap metal pickup")).toBeInTheDocument();
    expect(screen.queryByLabelText("New core service")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add /i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove /i })).not.toBeInTheDocument();
  });
});
