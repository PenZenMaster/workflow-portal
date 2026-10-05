import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { ApiAccessSection } from "./ApiAccessSection";

const FUTURE = Date.now() + 40 * 86_400_000;

function token(over: Record<string, unknown> = {}) {
  return {
    id: 11, clientId: 4, name: "Reporting Suite", tokenPrefix: "wfp_abc123",
    expiresAt: FUTURE, lastUsedAt: null, revokedAt: null, createdAt: Date.now() - 1000, ...over,
  };
}

let listStatus: number;
let tokens: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  listStatus = 200;
  tokens = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    let status = 200;
    let body: unknown = { data: null };
    if (method === "GET") {
      status = listStatus;
      body = listStatus === 200 ? { data: tokens } : { error: "Forbidden" };
    } else if (method === "POST") {
      status = 201;
      body = { data: { ...token({ id: 12, name: "Suite" }), token: "wfp_" + "f".repeat(64) } };
    } else if (method === "DELETE") {
      status = 204;
      body = null;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (body === null ? "" : JSON.stringify(body)),
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
      <ApiAccessSection clientId="4" />
    </QueryClientProvider>
  );
}

const callsWith = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);

describe("ApiAccessSection", () => {
  it("renders nothing when the list endpoint denies access (non-admin)", async () => {
    listStatus = 403;
    const { container } = renderSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("lists tokens with prefix, status and last-used, never a full token", async () => {
    tokens = [
      token(),
      token({ id: 12, name: "Old", tokenPrefix: "wfp_old111", revokedAt: Date.now() - 5 }),
      token({ id: 13, name: "Stale", tokenPrefix: "wfp_sta222", expiresAt: Date.now() - 5, lastUsedAt: Date.now() - 86_400_000 }),
    ];
    renderSection();

    expect(await screen.findByText("Reporting Suite")).toBeInTheDocument();
    expect(screen.getByText("wfp_abc123...")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getAllByText("Never").length).toBeGreaterThan(0);
    // Only the active token can be revoked
    expect(screen.getAllByRole("button", { name: /^Revoke/ })).toHaveLength(1);
  });

  it("creates a token, shows the raw token once with a warning, and sends name and lifetime", async () => {
    renderSection();
    await screen.findByLabelText(/token name/i);

    await userEvent.type(screen.getByLabelText(/token name/i), "Suite");
    await userEvent.click(screen.getByRole("button", { name: /create token/i }));

    const rawToken = "wfp_" + "f".repeat(64);
    expect(await screen.findByText(rawToken)).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();

    const [, init] = callsWith("POST")[0];
    expect(JSON.parse(init.body as string)).toEqual({ name: "Suite", ttlDays: 90 });

    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(screen.queryByText(rawToken)).not.toBeInTheDocument();
  });

  it("does not submit a blank token name", async () => {
    renderSection();
    await screen.findByLabelText(/token name/i);
    expect(screen.getByRole("button", { name: /create token/i })).toBeDisabled();
  });

  it("revokes only after an explicit confirm click", async () => {
    tokens = [token()];
    renderSection();

    await userEvent.click(await screen.findByRole("button", { name: /^Revoke/ }));
    expect(callsWith("DELETE")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: /confirm revoke/i }));
    await waitFor(() => expect(callsWith("DELETE")).toHaveLength(1));
    expect(callsWith("DELETE")[0][0]).toContain("/api/clients/4/api-tokens/11");
  });
});
