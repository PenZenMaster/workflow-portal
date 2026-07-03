/*
 * Module/Script Name: Breadcrumbs.test.tsx
 * Path: client/src/components/Breadcrumbs.test.tsx
 *
 * Description:
 * Tests for the shared Breadcrumbs navigation component: ancestor items
 * render as links, the last item renders as the current page, and items
 * without an href render as plain text.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-03
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Initial tests (breadcrumb navigation feature)
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders ancestors as links and the last item as the current page", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Clients", href: "/ai/clients" },
          { label: "Camp House Country Landscaping" },
        ]}
      />
    );

    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();

    const workflows = screen.getByRole("link", { name: "Workflows" });
    expect(workflows).toHaveAttribute("href", "/");
    const clients = screen.getByRole("link", { name: "Clients" });
    expect(clients).toHaveAttribute("href", "/ai/clients");

    const current = screen.getByText("Camp House Country Landscaping");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
  });

  it("renders an item without an href as plain text even mid-trail", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Loading Client" },
          { label: "Runs" },
        ]}
      />
    );

    expect(screen.getByText("Loading Client").closest("a")).toBeNull();
    expect(screen.getByText("Runs")).toHaveAttribute("aria-current", "page");
  });

  it("renders one list item per crumb", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Clients", href: "/ai/clients" },
          { label: "Acme" },
        ]}
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
