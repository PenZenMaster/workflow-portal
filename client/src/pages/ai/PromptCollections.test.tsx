/*
 * Module/Script Name: PromptCollections.test.tsx
 * Path: client/src/pages/ai/PromptCollections.test.tsx
 *
 * Description:
 * Tests for the Prompt Collections list page CRUD actions (B-18): inline
 * edit of name/notes, clone, archive/unarchive, and guarded delete with an
 * inline confirm step.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-03
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Initial tests (B-18 collection CRUD UI)
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import PromptCollections from "./PromptCollections";

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ id: "10" }) };
});

const DRAFT_COLLECTION = {
  id: 1,
  clientId: 10,
  name: "Q1 Audit",
  version: 1,
  status: "draft" as const,
  notes: "Original notes",
  parentCollectionId: null,
  panelType: "balanced_baseline" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const ARCHIVED_COLLECTION = {
  ...DRAFT_COLLECTION,
  id: 2,
  name: "Old Audit",
  status: "archived" as const,
};

let collectionsResponse: unknown;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  collectionsResponse = { data: [DRAFT_COLLECTION, ARCHIVED_COLLECTION] };

  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => collectionsResponse,
        text: async () => JSON.stringify(collectionsResponse),
      } as Response;
    }
    return {
      ok: true,
      status: method === "DELETE" ? 204 : 200,
      json: async () => ({ data: DRAFT_COLLECTION }),
      text: async () => "",
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PromptCollections />
    </QueryClientProvider>
  );
}

function mutationCalls(): Array<[string, string]> {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method && (init as RequestInit).method !== "GET")
    .map(([url, init]) => [(init as RequestInit).method as string, url as string]);
}

describe("PromptCollections - edit", () => {
  it("Edit reveals an inline form and Save PATCHes name and notes", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-edit-collection-1"));

    const nameInput = screen.getByTestId("input-edit-name-1");
    expect(nameInput).toHaveValue("Q1 Audit");

    await user.clear(nameInput);
    await user.type(nameInput, "Q1 Audit Renamed");
    await user.click(screen.getByTestId("button-save-edit-1"));

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual([
        "PATCH",
        "/api/prompt-collections/1",
      ]);
    });
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
    );
    const body = JSON.parse((patchCall![1] as RequestInit).body as string) as {
      name: string;
      notes?: string;
    };
    expect(body.name).toBe("Q1 Audit Renamed");
    expect(body.notes).toBe("Original notes");
  });
});

describe("PromptCollections - panel type (issue #4 Phase 3 item 9)", () => {
  it("New collection form defaults panel type to balanced_baseline and includes it in the create payload", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /new collection/i }));
    expect(screen.getByLabelText(/panel type/i)).toHaveValue("balanced_baseline");

    await user.type(screen.getByLabelText(/^name/i), "New Discovery Panel");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual(["POST", "/api/clients/10/prompt-collections"]);
    });
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    const body = JSON.parse((postCall![1] as RequestInit).body as string) as { panelType?: string };
    expect(body.panelType).toBe("balanced_baseline");
  });

  it("New collection form can select a different panel type before creating", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /new collection/i }));
    await user.selectOptions(screen.getByLabelText(/panel type/i), "discovery");
    await user.type(screen.getByLabelText(/^name/i), "New Discovery Panel");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual(["POST", "/api/clients/10/prompt-collections"]);
    });
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    const body = JSON.parse((postCall![1] as RequestInit).body as string) as { panelType?: string };
    expect(body.panelType).toBe("discovery");
  });

  it("Edit reveals the current panel type and Save PATCHes a changed value", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-edit-collection-1"));
    expect(screen.getByTestId("select-edit-panel-type-1")).toHaveValue("balanced_baseline");

    await user.selectOptions(screen.getByTestId("select-edit-panel-type-1"), "entity_audit");
    await user.click(screen.getByTestId("button-save-edit-1"));

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual(["PATCH", "/api/prompt-collections/1"]);
    });
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
    );
    const body = JSON.parse((patchCall![1] as RequestInit).body as string) as { panelType?: string };
    expect(body.panelType).toBe("entity_audit");
  });
});

describe("PromptCollections - clone", () => {
  it("Clone POSTs to the clone endpoint", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-clone-collection-1"));

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual([
        "POST",
        "/api/prompt-collections/1/clone",
      ]);
    });
  });
});

describe("PromptCollections - archive and unarchive", () => {
  it("Archive POSTs to the archive endpoint for a draft collection", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-archive-collection-1"));

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual([
        "POST",
        "/api/prompt-collections/1/archive",
      ]);
    });
  });

  it("Unarchive POSTs to the unarchive endpoint for an archived collection", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByTestId("button-unarchive-collection-2")
    );

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual([
        "POST",
        "/api/prompt-collections/2/unarchive",
      ]);
    });
    expect(
      screen.queryByTestId("button-archive-collection-2")
    ).not.toBeInTheDocument();
  });
});

describe("PromptCollections - delete", () => {
  it("Delete requires an inline confirm before sending DELETE", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("button-delete-collection-1"));

    // No request yet - the confirm step must appear first.
    expect(mutationCalls()).toEqual([]);

    await user.click(screen.getByTestId("button-confirm-delete-1"));

    await waitFor(() => {
      expect(mutationCalls()).toContainEqual([
        "DELETE",
        "/api/prompt-collections/1",
      ]);
    });
  });
});
