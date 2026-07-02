/*
 * Module/Script Name: LaunchInputsDialog.test.tsx
 * Path: client/src/components/LaunchInputsDialog.test.tsx
 *
 * Description:
 * Tests for optional inputs in the launch dialog: optional fields render
 * after required ones with an "(optional)" label, and the filled prompt
 * substitutes <PASTE> tokens with required values first, then optional
 * values (blank optional values fill as empty text).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-01
 * Comments:
 * - v1.00 Initial tests (optional inputs feature, v1.21.0)
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  createdAt: 1,
  updatedAt: 1,
};

let writeTextMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeTextMock = vi.fn().mockResolvedValue(undefined);
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
