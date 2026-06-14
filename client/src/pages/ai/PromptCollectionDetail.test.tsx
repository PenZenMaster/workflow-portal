import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import PromptCollectionDetail from "./PromptCollectionDetail";

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ id: "10", collectionId: "1" }) };
});

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "agency_admin" as const },
  config: {
    perplexityConfigured: true,
    googleOAuthConfigured: true,
    configuredPlatforms: ["perplexity"],
  },
};

const COLLECTION = {
  id: 1,
  clientId: 10,
  name: "Q1 Audit",
  version: 1,
  status: "draft" as const,
  notes: null,
  parentCollectionId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const CANDIDATES = [
  { text: "What is the best way to fix a leaky faucet?", category: "informational", funnelStage: "awareness" },
  { text: "Best plumber near Seattle", category: "local", funnelStage: "decision" },
];

const EXISTING_PROMPT = {
  id: 5,
  collectionId: 1,
  text: "Best plumber in Seattle",
  category: "local" as const,
  funnelStage: "decision" as const,
  geo: "Seattle, WA",
  deviceContext: null,
  priorityWeight: 1,
  status: "active" as const,
  targetPlatforms: [],
  position: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const GENERATE_URL = "/api/clients/10/prompt-collections/1/generate-prompts";
const BULK_URL = "/api/prompt-collections/1/prompts/bulk";
const PROMPT_PATCH_URL = "/api/prompts/5";

let fetchMock: ReturnType<typeof vi.fn>;
let promptsResponse: unknown;

beforeEach(() => {
  promptsResponse = { data: [] };

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "POST" && url === GENERATE_URL) {
      return { ok: true, status: 200, json: async () => ({ data: { candidates: CANDIDATES } }), text: async () => "" } as Response;
    }

    if (method === "POST" && url === BULK_URL) {
      return { ok: true, status: 201, json: async () => ({ data: [] }), text: async () => "" } as Response;
    }

    if (method === "PATCH" && url === PROMPT_PATCH_URL) {
      return { ok: true, status: 200, json: async () => ({ data: EXISTING_PROMPT }), text: async () => "" } as Response;
    }

    if (url === "/api/auth/status") {
      return { ok: true, status: 200, json: async () => AUTH_STATUS, text: async () => JSON.stringify(AUTH_STATUS) } as Response;
    }

    if (url === "/api/prompt-collections/1") {
      const body = { data: COLLECTION };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    }

    if (url === "/api/prompt-collections/1/prompts") {
      return { ok: true, status: 200, json: async () => promptsResponse, text: async () => JSON.stringify(promptsResponse) } as Response;
    }

    return { ok: true, status: 200, json: async () => ({ data: null }), text: async () => "{}" } as Response;
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
        <PromptCollectionDetail />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("PromptCollectionDetail — AI prompt generation", () => {
  it("Generate with AI posts to the generate endpoint and renders returned candidates", async () => {
    renderPage();

    const generateButton = await screen.findByRole("button", { name: /Generate with AI/i });
    await userEvent.click(generateButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        GENERATE_URL,
        expect.objectContaining({ method: "POST" }),
      ),
    );

    expect(await screen.findByDisplayValue("What is the best way to fix a leaky faucet?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Best plumber near Seattle")).toBeInTheDocument();
  });

  it("Save selected posts the checked candidates to the bulk import endpoint", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Generate with AI/i }));
    await screen.findByDisplayValue("What is the best way to fix a leaky faucet?");

    await userEvent.click(screen.getByRole("button", { name: /Save selected/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        BULK_URL,
        expect.objectContaining({ method: "POST" }),
      ),
    );

    const [, init] = fetchMock.mock.calls.find(([url, reqInit]) => url === BULK_URL && reqInit?.method === "POST")!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.prompts).toHaveLength(2);
    expect(body.prompts[0]).toMatchObject({
      text: "What is the best way to fix a leaky faucet?",
      category: "informational",
      funnelStage: "awareness",
    });
  });
});

describe("PromptCollectionDetail — edit existing prompt", () => {
  beforeEach(() => {
    promptsResponse = { data: [EXISTING_PROMPT] };
  });

  it("Edit reveals an editable form and Save PATCHes the prompt, preserving other fields", async () => {
    renderPage();

    expect(await screen.findByText("Best plumber in Seattle")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));

    const textInput = screen.getByDisplayValue("Best plumber in Seattle");
    await userEvent.clear(textInput);
    await userEvent.type(textInput, "Best plumber near Seattle, WA");

    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        PROMPT_PATCH_URL,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );

    const [, init] = fetchMock.mock.calls.find(([url, reqInit]) => url === PROMPT_PATCH_URL && reqInit?.method === "PATCH")!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      text: "Best plumber near Seattle, WA",
      category: "local",
      funnelStage: "decision",
      geo: "Seattle, WA",
      priorityWeight: 1,
      status: "active",
      targetPlatforms: [],
    });
  });
});
