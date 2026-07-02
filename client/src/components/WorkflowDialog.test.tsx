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
import { WorkflowDialog } from "./WorkflowDialog";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => ({ id: 1 }),
    text: async () => "",
  }) as Response);
  vi.stubGlobal("fetch", fetchMock);
});

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkflowDialog open={true} onOpenChange={vi.fn()} editing={null} />
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/workflows");
    expect(init.method).toBe("POST");
    const payload = JSON.parse(String(init.body));
    expect(payload.acceptsFileUpload).toBe(true);
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.optionalInputs).toEqual(["Competitor URL", "Target keyword"]);
  });
});
