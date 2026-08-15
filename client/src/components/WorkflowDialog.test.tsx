/*
 * Module/Script Name: WorkflowDialog.test.tsx
 * Path: client/src/components/WorkflowDialog.test.tsx
 *
 * Description:
 * Tests for the "Accept CSV upload" toggle on the workflow create/edit
 * dialog: the switch renders and its value is included in the POST payload.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-01
 * Comments:
 * - v1.00 Initial tests (workflow CSV upload feature, v1.20.0)
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { Workflow } from "@shared/schema";
import { WorkflowDialog } from "./WorkflowDialog";

const PLATFORMS = [
  { id: 1, slug: "perplexity", displayName: "Perplexity", enabled: true, config: {} },
  { id: 2, slug: "anthropic", displayName: "Claude (Anthropic)", enabled: true, config: {} },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/platforms") {
      const body = { data: PLATFORMS };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response;
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: 1 }),
      text: async () => "",
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderDialog(editing: Workflow | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkflowDialog open={true} onOpenChange={vi.fn()} editing={editing} />
    </QueryClientProvider>
  );
}

describe("WorkflowDialog - accepts file upload toggle", () => {
  it("renders the Accept CSV upload switch, off by default", () => {
    renderDialog();
    const toggle = screen.getByTestId("switch-accepts-file");
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("data-state", "unchecked");
  });

  it("includes acceptsFileUpload=true in the create payload when toggled on", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-name"), "Rank Tracker Analysis");
    await user.type(
      screen.getByTestId("input-description"),
      "Analyze a rank tracker CSV export"
    );
    await user.click(screen.getByTestId("switch-accepts-file"));
    await user.click(screen.getByTestId("button-save"));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
      );
      expect(post).toBeDefined();
    });
    const [url, init] = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    ) as [string, RequestInit];
    expect(url).toBe("/api/workflows");
    const payload = JSON.parse(String(init.body));
    expect(payload.acceptsFileUpload).toBe(true);
  });
});

describe("WorkflowDialog - AI model selection (B-22)", () => {
  it("shows the AI model select only when Accept CSV upload is on", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByTestId("select-ai-adapter")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("switch-accepts-file"));
    expect(await screen.findByTestId("select-ai-adapter")).toBeInTheDocument();
  });

  it("defaults aiAdapterSlug to null in the create payload", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-name"), "Rank Tracker Analysis");
    await user.type(screen.getByTestId("input-description"), "Analyze CSV");
    await user.click(screen.getByTestId("switch-accepts-file"));
    await user.click(screen.getByTestId("button-save"));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
      );
      expect(post).toBeDefined();
    });
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    )!;
    const payload = JSON.parse(String((post[1] as RequestInit).body));
    expect(payload.aiAdapterSlug).toBeNull();
  });

  it("preserves an existing aiAdapterSlug when editing and saving", async () => {
    const user = userEvent.setup();
    const editing: Workflow = {
      id: 7,
      name: "Rank Tracker Analysis",
      category: "Reporting",
      description: "Analyze CSV",
      inputs: [],
      optionalInputs: [],
      tags: [],
      prompt: "",
      launchUrl: "",
      launchLabel: "",
      pinned: false,
      acceptsFileUpload: true,
      aiAdapterSlug: "anthropic",
      rankrocketMcpEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    };
    renderDialog(editing);

    expect(await screen.findByTestId("select-ai-adapter")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-save"));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
      );
      expect(put).toBeDefined();
    });
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
    )!;
    const payload = JSON.parse(String((put[1] as RequestInit).body));
    expect(payload.aiAdapterSlug).toBe("anthropic");
  });
});

describe("WorkflowDialog - optional inputs", () => {
  it("splits the optional inputs textarea into an array in the create payload", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-name"), "Site Audit");
    await user.type(screen.getByTestId("input-description"), "Full audit");
    await user.type(
      screen.getByTestId("input-optional-inputs"),
      "Competitor URL{enter}Target keyword"
    );
    await user.click(screen.getByTestId("button-save"));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST"
      );
      expect(post).toBeDefined();
    });
    const [, init] = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    ) as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.optionalInputs).toEqual(["Competitor URL", "Target keyword"]);
  });
});
