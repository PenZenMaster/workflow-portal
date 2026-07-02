/*
 * Module/Script Name: WorkflowCard.test.tsx
 * Path: client/src/components/WorkflowCard.test.tsx
 *
 * Description:
 * Tests for the CSV upload + AI run UI on WorkflowCard: the upload section
 * renders only for workflows with acceptsFileUpload, and running a file
 * POSTs its text to the run-with-file endpoint and renders the response.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-01
 * Comments:
 * - v1.00 Initial tests (workflow CSV upload feature, v1.20.0)
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowCard } from "./WorkflowCard";
import type { Workflow } from "@shared/schema";

const BASE_WORKFLOW: Workflow = {
  id: 7,
  name: "Rank Tracker Analysis",
  category: "Reporting",
  description: "Analyze a rank tracker CSV export with AI",
  inputs: [],
  optionalInputs: [],
  tags: [],
  prompt: "You are an SEO analyst.",
  launchUrl: "",
  launchLabel: "",
  pinned: false,
  acceptsFileUpload: true,
  createdAt: 1,
  updatedAt: 1,
};

const noop = vi.fn();

function renderCard(workflow: Workflow) {
  return render(
    <WorkflowCard
      workflow={workflow}
      onEdit={noop}
      onDelete={noop}
      onTogglePin={noop}
    />
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        response: "Local pack rankings are strong across branded terms.",
        modelVariant: "gpt-test",
        latencyMs: 1200,
      },
    }),
    text: async () => "",
  }) as Response);
  vi.stubGlobal("fetch", fetchMock);
});

describe("WorkflowCard - CSV upload", () => {
  it("shows the file input and Run with AI button when acceptsFileUpload is true", () => {
    renderCard(BASE_WORKFLOW);
    expect(screen.getByTestId("input-file-7")).toBeInTheDocument();
    expect(screen.getByTestId("button-run-file-7")).toBeInTheDocument();
  });

  it("hides the upload section when acceptsFileUpload is false", () => {
    renderCard({ ...BASE_WORKFLOW, acceptsFileUpload: false });
    expect(screen.queryByTestId("input-file-7")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-run-file-7")).not.toBeInTheDocument();
  });

  it("POSTs the file text as text/csv and renders the AI response", async () => {
    const user = userEvent.setup();
    renderCard(BASE_WORKFLOW);

    const csv = "Keyword,Rank\nfoundation repair,3\n";
    const file = new File([csv], "ranks-jun-2026.csv", { type: "text/csv" });

    await user.upload(screen.getByTestId("input-file-7"), file);
    await user.click(screen.getByTestId("button-run-file-7"));

    expect(
      await screen.findByText(/Local pack rankings are strong/)
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/workflows/7/run-with-file");
    expect(url).toContain("filename=ranks-jun-2026.csv");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("text/csv");
    expect(init.body).toBe(csv);
  });

  it("disables the run button until a file is selected", () => {
    renderCard(BASE_WORKFLOW);
    expect(screen.getByTestId("button-run-file-7")).toBeDisabled();
  });
});

describe("WorkflowCard - optional inputs", () => {
  it("renders the Optional inputs list when optionalInputs is non-empty", () => {
    renderCard({
      ...BASE_WORKFLOW,
      inputs: ["Website URL"],
      optionalInputs: ["Competitor URL", "Target keyword"],
    });
    expect(screen.getByText("Optional inputs")).toBeInTheDocument();
    expect(screen.getByTestId("text-optional-input-7-0")).toHaveTextContent(
      "Competitor URL"
    );
    expect(screen.getByTestId("text-optional-input-7-1")).toHaveTextContent(
      "Target keyword"
    );
  });

  it("does not render the Optional inputs section when the list is empty", () => {
    renderCard({ ...BASE_WORKFLOW, inputs: ["Website URL"] });
    expect(screen.queryByText("Optional inputs")).not.toBeInTheDocument();
  });

  it("opens the launch inputs dialog when only optional inputs exist", async () => {
    const user = userEvent.setup();
    renderCard({
      ...BASE_WORKFLOW,
      launchUrl: "https://www.perplexity.ai/",
      optionalInputs: ["Competitor URL"],
    });

    await user.click(screen.getByTestId("button-launch-7"));
    expect(
      await screen.findByTestId("button-launch-confirm")
    ).toBeInTheDocument();
  });
});
