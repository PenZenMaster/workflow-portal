import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTooltip } from "./InfoTooltip";

function renderTooltip() {
  return render(
    <TooltipProvider>
      <InfoTooltip label="About client vs competitor" text="Client is your agency's own brand; Competitor brands are tracked for AI Share of Voice." />
    </TooltipProvider>
  );
}

describe("InfoTooltip", () => {
  it("shows the explanatory text on hover", async () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "About client vs competitor" });

    expect(screen.queryByText(/Client is your agency's own brand/)).not.toBeInTheDocument();

    await userEvent.hover(trigger);

    expect(
      await screen.findByRole("tooltip", { name: /Client is your agency's own brand/ })
    ).toBeInTheDocument();
  });
});
