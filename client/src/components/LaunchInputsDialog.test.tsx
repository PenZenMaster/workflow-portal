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
  rankrocketMcpEnabled: false,
  growthPlanEnabled: false,
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
    expect(
      screen.getByTestId("launch-optional-input-0").closest("div")
    ).toHaveTextContent(/\(optional\)/);
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

describe("LaunchInputsDialog - template file attachment", () => {
  it("renders the template file picker in launch mode", () => {
    renderDialog();
    expect(screen.getByTestId("launch-template-file-input")).toBeInTheDocument();
  });

  it("does not render the template file picker in ai-run mode", () => {
    render(
      <LaunchInputsDialog
        workflow={WORKFLOW}
        open={true}
        onOpenChange={vi.fn()}
        mode="ai-run"
        onRun={vi.fn()}
      />
    );
    expect(
      screen.queryByTestId("launch-template-file-input")
    ).not.toBeInTheDocument();
  });

  it("rejects a non-HTML file and does not attach it", async () => {
    const user = setupUser();
    renderDialog();

    const file = new File(["a,b,c"], "data.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("launch-template-file-input"), file);

    expect(screen.queryByText("data.csv")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-copy"));

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.not.stringContaining("Template reference")
    );
  });

  it("rejects an oversized HTML file and does not attach it", async () => {
    const user = setupUser();
    renderDialog();

    const file = new File(["<html></html>"], "big.html", { type: "text/html" });
    Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });
    await user.upload(screen.getByTestId("launch-template-file-input"), file);

    expect(screen.queryByText("big.html")).not.toBeInTheDocument();
  });

  it("includes the attached HTML file's content when copying the prompt", async () => {
    const user = setupUser();
    renderDialog();

    const file = new File(["<div>hello</div>"], "template.html", {
      type: "text/html",
    });
    await user.upload(screen.getByTestId("launch-template-file-input"), file);
    expect(screen.getByText("template.html")).toBeInTheDocument();

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-copy"));

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("<div>hello</div>")
    );
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("template.html")
    );
  });

  it("forces clipboard mode and includes file content when Launch is clicked, even for a Perplexity URL", async () => {
    const user = setupUser();
    const openSpy = vi.fn().mockReturnValue(null);
    vi.stubGlobal("open", openSpy);

    render(
      <LaunchInputsDialog
        workflow={{ ...WORKFLOW, launchUrl: "https://www.perplexity.ai/" }}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    const file = new File(["<div>hello</div>"], "template.html", {
      type: "text/html",
    });
    await user.upload(screen.getByTestId("launch-template-file-input"), file);
    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-confirm"));

    expect(openSpy).toHaveBeenCalledWith(
      "https://www.perplexity.ai/",
      "_blank",
      "noopener,noreferrer"
    );
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("<div>hello</div>")
    );
    expect(await screen.findByTestId("launch-instructions")).toHaveTextContent(
      /Ctrl\+V/
    );
    vi.unstubAllGlobals();
  });

  it("excludes the file's content once it is removed before launching", async () => {
    const user = setupUser();
    renderDialog();

    const file = new File(["<div>hello</div>"], "template.html", {
      type: "text/html",
    });
    await user.upload(screen.getByTestId("launch-template-file-input"), file);
    await user.click(screen.getByTestId("launch-template-file-remove"));
    expect(screen.queryByText("template.html")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("launch-input-0"), "https://uss.com");
    await user.click(screen.getByTestId("button-launch-copy"));

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.not.stringContaining("Template reference")
    );
  });

  it("resets the attached file when the dialog is reopened", async () => {
    const user = setupUser();
    const { rerender } = renderDialog();

    const file = new File(["<div>hello</div>"], "template.html", {
      type: "text/html",
    });
    await user.upload(screen.getByTestId("launch-template-file-input"), file);
    expect(screen.getByText("template.html")).toBeInTheDocument();

    rerender(
      <LaunchInputsDialog workflow={WORKFLOW} open={false} onOpenChange={vi.fn()} />
    );
    rerender(
      <LaunchInputsDialog workflow={WORKFLOW} open={true} onOpenChange={vi.fn()} />
    );

    expect(screen.queryByText("template.html")).not.toBeInTheDocument();
  });
});

describe("LaunchInputsDialog - RankRocket MCP dropdowns", () => {
  const RANKROCKET_WORKFLOW: Workflow = {
    ...WORKFLOW,
    id: 9,
    name: "RankRocket Site Insights",
    inputs: ["RankRocket MCP site key", "What do you want to know about this site?"],
    optionalInputs: [],
    prompt: "Site: <PASTE>. Question: <PASTE>.",
    rankrocketMcpEnabled: true,
  };

  function mockSitesFetch(sites: string[], questionOptions: string[] = []) {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET" && String(url).endsWith("/rankrocket-mcp/sites")) {
        const body = { data: sites };
        return {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }
      if (method === "GET" && String(url).endsWith("/rankrocket-question-options")) {
        const body = { data: questionOptions.map((label, i) => ({ id: i + 1, label, sortOrder: i })) };
        return {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }
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
  }

  it("renders comboboxes (not text inputs) for the site key and question fields", async () => {
    mockSitesFetch(["tristate-hvac", "trevoraspiranti"]);
    renderDialog(RANKROCKET_WORKFLOW);

    const siteTrigger = await screen.findByTestId("launch-input-0");
    const questionTrigger = screen.getByTestId("launch-input-1");
    expect(siteTrigger).toHaveAttribute("role", "combobox");
    expect(questionTrigger).toHaveAttribute("role", "combobox");
    expect(siteTrigger.tagName).not.toBe("INPUT");
    expect(questionTrigger.tagName).not.toBe("INPUT");
  });

  it("enables the site select once the sites endpoint resolves with data", async () => {
    mockSitesFetch(["tristate-hvac"]);
    renderDialog(RANKROCKET_WORKFLOW);

    await waitFor(() => {
      expect(screen.getByTestId("launch-input-0")).not.toBeDisabled();
    });
  });

  it("keeps the site select disabled with a helpful placeholder when no sites are available", async () => {
    mockSitesFetch([]);
    renderDialog(RANKROCKET_WORKFLOW);

    await waitFor(() => {
      expect(screen.getByTestId("launch-input-0")).toBeDisabled();
    });
    expect(screen.getByText(/No sites available/i)).toBeInTheDocument();
  });

  it("does not fetch the sites endpoint for a normal (non-RankRocket) workflow", () => {
    renderDialog(WORKFLOW);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/rankrocket-mcp/sites"))
    ).toBe(false);
  });

  it("still renders plain text inputs for a normal (non-RankRocket) workflow", () => {
    renderDialog(WORKFLOW);
    expect(screen.getByTestId("launch-input-0").tagName).toBe("INPUT");
  });

  // RankRocket Site Insights admin CRUD, Part C: question options are now
  // fetched from the portal's own API instead of imported from a hardcoded
  // RANKROCKET_QUESTION_OPTIONS const array.
  it("fetches question options from the portal API rather than a hardcoded list", async () => {
    mockSitesFetch(["tristate-hvac"], ["Broken links across the site"]);
    renderDialog(RANKROCKET_WORKFLOW);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/rankrocket-question-options"))
      ).toBe(true)
    );
  });

  it("does not fetch question options for a normal (non-RankRocket) workflow", () => {
    renderDialog(WORKFLOW);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/rankrocket-question-options"))
    ).toBe(false);
  });
});

describe("LaunchInputsDialog - growth-plan client picker", () => {
  const GROWTH_PLAN_WORKFLOW: Workflow = {
    ...WORKFLOW,
    id: 20,
    name: "Ranking Audit and Improvement Suite",
    inputs: [],
    optionalInputs: ["Target service areas"],
    acceptsFileUpload: true,
    growthPlanEnabled: true,
  };

  function mockClientsFetch(clients: Array<{ id: number; name: string }>) {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET" && String(url).endsWith("/api/clients")) {
        const body = { data: clients };
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
  }

  it("renders a client picker and fetches the client list", async () => {
    mockClientsFetch([{ id: 4, name: "Trevor Aspiranti" }]);
    render(
      <LaunchInputsDialog
        workflow={GROWTH_PLAN_WORKFLOW}
        open={true}
        onOpenChange={vi.fn()}
        mode="ai-run"
        onRun={vi.fn()}
      />
    );

    expect(screen.getByTestId("launch-client-picker")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/clients"))).toBe(
        true
      )
    );
  });

  it("does not fetch the client list for a non-growth-plan workflow", () => {
    renderDialog(WORKFLOW);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/clients"))).toBe(
      false
    );
  });

  it("disables Run with AI until a client is selected, then passes clientId to onRun", async () => {
    mockClientsFetch([{ id: 4, name: "Trevor Aspiranti" }]);
    const onRun = vi.fn();
    const user = userEvent.setup();
    render(
      <LaunchInputsDialog
        workflow={GROWTH_PLAN_WORKFLOW}
        open={true}
        onOpenChange={vi.fn()}
        mode="ai-run"
        onRun={onRun}
      />
    );

    expect(screen.getByTestId("button-run-confirm")).toBeDisabled();

    await user.click(screen.getByTestId("launch-client-picker"));
    await user.click(await screen.findByText("Trevor Aspiranti"));

    expect(screen.getByTestId("button-run-confirm")).not.toBeDisabled();
    await user.click(screen.getByTestId("button-run-confirm"));

    expect(onRun).toHaveBeenCalledWith([""], 4);
  });
});
