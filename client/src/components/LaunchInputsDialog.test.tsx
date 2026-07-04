/*
 * Module/Script Name: LaunchInputsDialog.test.tsx
 * Path: client/src/components/LaunchInputsDialog.test.tsx
 *
 * Description:
 * Tests for optional inputs in the launch dialog: optional fields render
 * after required ones with an "(optional)" label, and the filled prompt
 * substitutes <PASTE> tokens with required values first, then optional
 * values (blank optional values fill as empty text).
 * Also tests the post-launch instruction step: clipboard and prefill
 * launches keep the dialog open with persistent instructions; only
 * auto-submit launches close it immediately.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-02
 * Comments:
 * - v1.00 Initial tests (optional inputs feature, v1.21.0)
 * - v1.01 Launch-mode instruction step tests (v1.22.0)
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LaunchInputsDialog } from "./LaunchInputsDialog";
import type { Workflow } from "@shared/schema";

const WORKFLOW: Workflow = {
  id: 3,
  name: "Site Audit",
  category: "Audit",
  description: "Full audit",
  inputs: ["Website URL"],
  optionalInputs: ["Competitor URL"],
  tags: [],
  prompt: "Audit <PASTE> and compare against <PASTE>.",
  launchUrl: "https://claude.ai/",
  launchLabel: "Launch in Claude",
  pinned: false,
  acceptsFileUpload: false,
  aiAdapterSlug: null,
  createdAt: 1,
  updatedAt: 1,
};

let writeTextMock: ReturnType<typeof vi.fn>;
let savedValuesResponse: Record<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  savedValuesResponse = {};
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && String(url).endsWith("/input-values")) {
      const body = { data: savedValuesResponse };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
      text: async () => "{}",
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

// userEvent.setup() installs its own clipboard stub, so the spy must be
// attached AFTER setup() to be the one the component calls.
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
  return user;
}

function renderDialog(workflow: Workflow = WORKFLOW) {
  return render(
    <LaunchInputsDialog workflow={workflow} open={true} onOpenChange={vi.fn()} />
  );
}

describe("LaunchInputsDialog - optional inputs", () => {
  it("renders required fields first, then optional fields labeled (optional)", () => {
    renderDialog();
    expect(screen.getByTestId("launch-input-0")).toBeInTheDocument();
    expect(screen.getByTestId("launch-optional-input-0")).toBeInTheDocument();
    expect(screen.getByText(/Competitor URL/)).toBeInTheDocument();
    expect(screen.getByText(/\(optional\)/)).toBeInTheDocument();
  });

  it("fills <PASTE> tokens with required values first, then optional values", async () => {
    const user = setupUser();
    renderDialog();

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.type(
      screen.getByTestId("launch-optional-input-0"),
      "https://rival.com"
    );
    await user.click(screen.getByTestId("button-launch-copy"));

    expect(writeTextMock).toHaveBeenCalledWith(
      "Audit https://uss.com and compare against https://rival.com."
    );
  });

  it("fills blank optional values as empty text", async () => {
    const user = setupUser();
    renderDialog();

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-copy"));

    expect(writeTextMock).toHaveBeenCalledWith(
      "Audit https://uss.com and compare against ."
    );
  });
});

describe("LaunchInputsDialog - saved input values (B-23)", () => {
  it("prefills inputs from the saved values endpoint on open", async () => {
    savedValuesResponse = {
      "Website URL": "https://saved-client.com",
      "Competitor URL": "https://saved-rival.com",
    };
    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("launch-input-0")).toHaveValue(
        "https://saved-client.com"
      );
    });
    expect(screen.getByTestId("launch-optional-input-0")).toHaveValue(
      "https://saved-rival.com"
    );
  });

  it("PUTs the entered values to the input-values endpoint on launch", async () => {
    const openSpy = vi.fn().mockReturnValue(null);
    vi.stubGlobal("open", openSpy);
    const user = setupUser();
    renderDialog();

    await user.type(screen.getByTestId("launch-input-0"), "https://typed.com");
    await user.click(screen.getByTestId("button-launch-confirm"));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
      );
      expect(put).toBeDefined();
    });
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
    )!;
    expect(String(put[0])).toBe("/api/workflows/3/input-values");
    const body = JSON.parse(String((put[1] as RequestInit).body)) as {
      values: Record<string, string>;
    };
    expect(body.values).toEqual({ "Website URL": "https://typed.com" });
    vi.unstubAllGlobals();
  });
});

describe("LaunchInputsDialog - launch instruction step", () => {
  let openSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openSpy = vi.fn().mockReturnValue(null);
    vi.stubGlobal("open", openSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the dialog open with paste instructions for a non-Perplexity launch", async () => {
    const user = setupUser();
    const onOpenChange = vi.fn();
    render(
      <LaunchInputsDialog
        workflow={WORKFLOW}
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-confirm"));

    expect(openSpy).toHaveBeenCalledWith(
      "https://claude.ai/",
      "_blank",
      "noopener,noreferrer"
    );
    expect(await screen.findByTestId("launch-instructions")).toHaveTextContent(
      /Ctrl\+V/
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows press-Enter instructions when Perplexity prefills but cannot auto-submit", async () => {
    const user = setupUser();
    render(
      <LaunchInputsDialog
        workflow={{
          ...WORKFLOW,
          launchUrl: "https://www.perplexity.ai/computer",
        }}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-confirm"));

    const openedUrl = String(openSpy.mock.calls[0]?.[0]);
    expect(openedUrl).toContain("/computer");
    expect(openedUrl).toContain("q=");
    expect(await screen.findByTestId("launch-instructions")).toHaveTextContent(
      /press Enter/i
    );
  });

  it("closes the dialog when a Perplexity /search launch auto-submits", async () => {
    const user = setupUser();
    const onOpenChange = vi.fn();
    render(
      <LaunchInputsDialog
        workflow={{ ...WORKFLOW, launchUrl: "https://www.perplexity.ai/" }}
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-confirm"));

    const openedUrl = String(openSpy.mock.calls[0]?.[0]);
    expect(openedUrl).toContain("/search");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes the instruction step via the Done button", async () => {
    const user = setupUser();
    const onOpenChange = vi.fn();
    render(
      <LaunchInputsDialog
        workflow={WORKFLOW}
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-confirm"));
    await user.click(await screen.findByTestId("button-launch-done"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
