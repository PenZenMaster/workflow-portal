import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import type { UserRole } from "@shared/schema";
import PromptCollectionDetail from "./PromptCollectionDetail";

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ id: "10", collectionId: "1" }) };
});

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "agency_admin" as UserRole },
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
  panelType: "balanced_baseline" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const CANDIDATES = [
  {
    text: "What is the best way to fix a leaky faucet?",
    category: "informational",
    funnelStage: "awareness",
    intentType: "problem_solution",
    brandInPrompt: false,
    service: "drain cleaning",
    geo: null,
    rationale: "Problem-to-provider connection",
    warnings: ["Service \"drain cleaning\" is not one of the client's configured core services"],
  },
  {
    text: "Best plumber near Seattle",
    category: "local",
    funnelStage: "decision",
    intentType: "geographic_discovery",
    brandInPrompt: false,
    service: null,
    geo: "Seattle, WA",
    rationale: null,
    warnings: [],
  },
];

const GENERATION_RESULT = {
  candidates: CANDIDATES,
  invalid: [{ item: { text: "" }, errors: ["Prompt text is required"] }],
  warnings: ["Only 2 of 12 requested prompts were valid"],
  generationRunId: 42,
};

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
const SCHEDULES_URL = "/api/clients/10/schedules";

const SAMPLE_SCHEDULE = {
  id: 7,
  clientId: 10,
  collectionId: 1,
  platformIds: [1],
  cadence: "weekly" as const,
  dayOfWeek: 2,
  dayOfMonth: null,
  hourUtc: 14,
  lastFiredAt: null,
  nextFireAt: Date.now() + 86_400_000,
  enabled: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const PLATFORMS = [
  { id: 1, slug: "perplexity", displayName: "Perplexity", enabled: true, createdAt: Date.now(), updatedAt: Date.now() },
];

let fetchMock: ReturnType<typeof vi.fn>;
let promptsResponse: unknown;
let schedulesResponse: unknown;
let authStatus: typeof AUTH_STATUS;

beforeEach(() => {
  promptsResponse = { data: [] };
  schedulesResponse = { data: [] };
  authStatus = AUTH_STATUS;

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "POST" && url === GENERATE_URL) {
      return { ok: true, status: 200, json: async () => ({ data: GENERATION_RESULT }), text: async () => "" } as Response;
    }

    if (method === "POST" && url === BULK_URL) {
      return { ok: true, status: 201, json: async () => ({ data: [] }), text: async () => "" } as Response;
    }

    if (method === "PATCH" && url === PROMPT_PATCH_URL) {
      return { ok: true, status: 200, json: async () => ({ data: EXISTING_PROMPT }), text: async () => "" } as Response;
    }

    if (url === "/api/auth/status") {
      return { ok: true, status: 200, json: async () => authStatus, text: async () => JSON.stringify(authStatus) } as Response;
    }

    if (url === "/api/prompt-collections/1") {
      const body = { data: COLLECTION };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    }

    if (url === "/api/prompt-collections/1/prompts") {
      return { ok: true, status: 200, json: async () => promptsResponse, text: async () => JSON.stringify(promptsResponse) } as Response;
    }

    if (url === "/api/platforms") {
      const body = { data: PLATFORMS };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
    }

    if (method === "GET" && url === SCHEDULES_URL) {
      return { ok: true, status: 200, json: async () => schedulesResponse, text: async () => JSON.stringify(schedulesResponse) } as Response;
    }

    if (method === "POST" && url === SCHEDULES_URL) {
      return { ok: true, status: 201, json: async () => ({ data: SAMPLE_SCHEDULE }), text: async () => "" } as Response;
    }

    if (method === "PATCH" && url.startsWith("/api/schedules/")) {
      return { ok: true, status: 200, json: async () => ({ data: { ...SAMPLE_SCHEDULE, enabled: false } }), text: async () => "" } as Response;
    }

    if (method === "DELETE" && url.startsWith("/api/schedules/")) {
      return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
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

describe("PromptCollectionDetail — panel type (issue #4 Phase 3 item 9)", () => {
  it("shows the collection's panel type next to version and status", async () => {
    renderPage();
    expect(await screen.findByText(/balanced baseline/i)).toBeInTheDocument();
  });
});

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

  it("shows intent metadata, rejected count, and warnings from the generation result", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Generate with AI/i }));
    await screen.findByDisplayValue("What is the best way to fix a leaky faucet?");

    expect(screen.getByText(/problem_solution/i)).toBeInTheDocument();
    expect(screen.getByText(/geographic_discovery/i)).toBeInTheDocument();
    expect(screen.getAllByText(/non-branded/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 rejected/i)).toBeInTheDocument();
    expect(screen.getByText(/Only 2 of 12 requested prompts were valid/i)).toBeInTheDocument();
  });

  it("shows a warning once a candidate's text is edited, since its classification may no longer match (issue #4 Phase 2 item 8)", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Generate with AI/i }));
    const textInput = await screen.findByDisplayValue("What is the best way to fix a leaky faucet?");

    expect(screen.queryByText(/text edited/i)).not.toBeInTheDocument();

    await userEvent.type(textInput, " urgently");

    expect(screen.getByText(/text edited/i)).toBeInTheDocument();
  });

  it("shows a candidate's geo/service metadata warnings from the deterministic check (issue #4 Phase 2 item 6)", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Generate with AI/i }));
    await screen.findByDisplayValue("What is the best way to fix a leaky faucet?");

    expect(
      screen.getByText(/Service "drain cleaning" is not one of the client's configured core services/i)
    ).toBeInTheDocument();
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
      intentType: "problem_solution",
      brandInPrompt: false,
      service: "drain cleaning",
    });
    // rationale and warnings are display-only provenance; null geo/service
    // must be omitted (insertPromptSchema rejects null)
    expect(body.prompts[0]).not.toHaveProperty("rationale");
    expect(body.prompts[0]).not.toHaveProperty("warnings");
    expect(body.prompts[0]).not.toHaveProperty("geo");
    expect(body.prompts[1]).toMatchObject({ geo: "Seattle, WA", intentType: "geographic_discovery" });
    expect(body.prompts[1]).not.toHaveProperty("service");
    expect(body.prompts[1]).not.toHaveProperty("warnings");
  });

  it("Save selected includes the generationRunId so saved prompts carry provenance (E2c)", async () => {
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
    expect(body.generationRunId).toBe(42);
  });
});

describe("PromptCollectionDetail — generation provenance badge (E2c)", () => {
  const GENERATION_RUN = {
    id: 42,
    clientId: 10,
    collectionId: 1,
    requestedCount: 12,
    adapterSlug: "openai",
    modelVariant: "gpt-4o-mini",
    methodologyVersion: "1.0",
    contextSnapshot: "{}",
    rawOutput: "RAW",
    validCount: 10,
    invalidCount: 2,
    warnings: [],
    invalidItems: [],
    createdByUserId: 1,
    createdAt: Date.now(),
  };

  beforeEach(() => {
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET" && url === "/api/prompt-collections/1/generation-runs") {
        const body = { data: [GENERATION_RUN] };
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
      }
      return base(url, init);
    });
  });

  it("shows an AI generated badge with adapter provenance on generated prompts", async () => {
    promptsResponse = { data: [{ ...EXISTING_PROMPT, generationRunId: 42 }] };
    renderPage();

    const badge = await screen.findByText(/AI generated/i);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", expect.stringContaining("openai"));
    expect(badge).toHaveAttribute("title", expect.stringContaining("1.0"));
  });

  it("shows no badge on manually added prompts", async () => {
    promptsResponse = { data: [{ ...EXISTING_PROMPT, generationRunId: null }] };
    renderPage();

    await screen.findByText("Best plumber in Seattle");
    expect(screen.queryByText(/AI generated/i)).not.toBeInTheDocument();
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

describe("PromptCollectionDetail — Schedules", () => {
  // Arizona (America/Phoenix) is UTC-7 year-round (no DST), so the
  // local<->UTC offset used by scheduleTiming is fixed and deterministic
  // regardless of the current date.
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Phoenix";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("lists existing schedules with a cadence summary (in local time), next-run time, and admin-only enable/delete controls", async () => {
    schedulesResponse = { data: [SAMPLE_SCHEDULE] };
    renderPage();

    // hourUtc:14 on Tuesday (UTC) -> 07:00 Tuesday in America/Phoenix (UTC-7).
    expect(await screen.findByText(/Weekly on Tuesday at 07:00/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Enabled/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /Delete schedule/i })).toBeInTheDocument();
  });

  it("admin can add a new schedule, converting local day/hour input to UTC before posting", async () => {
    schedulesResponse = { data: [] };
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Add schedule/i }));

    await userEvent.selectOptions(screen.getByLabelText(/Cadence/i), "weekly");
    await userEvent.selectOptions(screen.getByLabelText(/Day of week/i), "3");
    const hourInput = screen.getByLabelText(/Hour/i);
    await userEvent.clear(hourInput);
    await userEvent.type(hourInput, "9");
    await userEvent.click(screen.getByRole("checkbox", { name: /Perplexity/i }));

    await userEvent.click(screen.getByRole("button", { name: /Save schedule/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        SCHEDULES_URL,
        expect.objectContaining({ method: "POST" }),
      ),
    );

    // Wednesday 09:00 local (America/Phoenix, UTC-7) -> Wednesday 16:00 UTC.
    const [, init] = fetchMock.mock.calls.find(([url, reqInit]) => url === SCHEDULES_URL && reqInit?.method === "POST")!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      collectionId: 1,
      cadence: "weekly",
      dayOfWeek: 3,
      hourUtc: 16,
      platformIds: [1],
    });
  });

  it("toggling the enabled checkbox PATCHes the schedule", async () => {
    schedulesResponse = { data: [SAMPLE_SCHEDULE] };
    renderPage();

    const toggle = await screen.findByRole("checkbox", { name: /Enabled/i });
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/schedules/7",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });

  it("non-admin roles see the schedule list but no add/delete/toggle controls", async () => {
    authStatus = { ...AUTH_STATUS, user: { ...AUTH_STATUS.user, role: "analyst" as const } };
    schedulesResponse = { data: [SAMPLE_SCHEDULE] };
    renderPage();

    expect(await screen.findByText(/Weekly on Tuesday at 07:00/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add schedule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete schedule/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Enabled/i })).not.toBeInTheDocument();
  });
});
