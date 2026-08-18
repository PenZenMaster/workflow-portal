import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import RankRocketSiteInsights from "./RankRocketSiteInsights";

const AUTH_STATUS = {
  needsSetup: false,
  authenticated: true,
  user: { id: 1, username: "admin", email: null, role: "agency_admin" as const },
  config: { perplexityConfigured: true, googleOAuthConfigured: false, configuredPlatforms: [] },
};

const OPTIONS = [
  { id: 1, label: "Broken links across the site", sortOrder: 0 },
  { id: 2, label: "Image alt-text coverage across the site", sortOrder: 1 },
];

const SITES = [
  { key: "tristate-hvac", baseUrl: "https://tristate-hvac.com", authUser: "admin" },
];

const API_RESPONSES: Record<string, unknown> = {
  "/api/auth/status": AUTH_STATUS,
  "/api/rankrocket-question-options": { data: OPTIONS },
  "/api/rankrocket-mcp/sites/admin": { data: SITES },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "PATCH" && url === "/api/rankrocket-question-options/1") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { ...OPTIONS[0], label: "Updated label" } }),
        text: async () => "",
      } as Response;
    }

    if (method === "DELETE" && url === "/api/rankrocket-question-options/2") {
      return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
    }

    if (method === "POST" && url === "/api/rankrocket-question-options") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 9, label: payload.label, sortOrder: 2 } }),
        text: async () => "",
      } as Response;
    }

    if (method === "POST" && url === "/api/rankrocket-mcp/sites") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { key: payload.key } }),
        text: async () => "",
      } as Response;
    }

    if (method === "PATCH" && url === "/api/rankrocket-mcp/sites/tristate-hvac") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { key: "tristate-hvac" } }),
        text: async () => "",
      } as Response;
    }

    if (method === "DELETE" && url === "/api/rankrocket-mcp/sites/tristate-hvac") {
      return { ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response;
    }

    const body = API_RESPONSES[url] ?? { data: null };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
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
        <RankRocketSiteInsights />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("RankRocketSiteInsights admin page - question options (Part C)", () => {
  it("renders the question option list", async () => {
    renderPage();
    expect(await screen.findByText("Broken links across the site")).toBeInTheDocument();
    expect(await screen.findByText("Image alt-text coverage across the site")).toBeInTheDocument();
  });

  it("editing an option's label sends a PATCH request", async () => {
    renderPage();
    await screen.findByText("Broken links across the site");

    await userEvent.click(screen.getByRole("button", { name: /Edit Broken links across the site/i }));
    const input = screen.getByDisplayValue("Broken links across the site");
    await userEvent.clear(input);
    await userEvent.type(input, "Updated label");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rankrocket-question-options/1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ label: "Updated label" }) })
      )
    );
  });

  it("deleting an option sends a DELETE request", async () => {
    renderPage();
    await screen.findByText("Image alt-text coverage across the site");

    await userEvent.click(
      screen.getByRole("button", { name: /Delete Image alt-text coverage across the site/i })
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rankrocket-question-options/2",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("adding a new option sends a POST request", async () => {
    renderPage();
    await screen.findByText("Broken links across the site");

    await userEvent.type(screen.getByLabelText(/New question option/i), "A brand new question");
    await userEvent.click(screen.getByRole("button", { name: /Add question option/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rankrocket-question-options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ label: "A brand new question" }),
        })
      )
    );
  });
});

describe("RankRocketSiteInsights admin page - sites (Part D)", () => {
  it("renders the site list with key/baseUrl/authUser, never a password field value", async () => {
    renderPage();
    expect(await screen.findByText("tristate-hvac")).toBeInTheDocument();
    expect(screen.getByText("https://tristate-hvac.com")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("adding a new site sends a POST with key/baseUrl/authUser/appPassword", async () => {
    renderPage();
    await screen.findByText("tristate-hvac");

    await userEvent.type(screen.getByLabelText(/^Site key$/i), "new-site");
    await userEvent.type(screen.getByLabelText(/^Base URL$/i), "https://new-site.com");
    await userEvent.type(screen.getByLabelText(/^WP username$/i), "admin");
    await userEvent.type(screen.getByLabelText(/^WP Application Password$/i), "secret pass");
    await userEvent.click(screen.getByRole("button", { name: /Add site/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rankrocket-mcp/sites",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            key: "new-site",
            baseUrl: "https://new-site.com",
            authUser: "admin",
            appPassword: "secret pass",
          }),
        })
      )
    );
  });

  it("the add-site password field is a masked password input", async () => {
    renderPage();
    await screen.findByText("tristate-hvac");
    expect(screen.getByLabelText(/^WP Application Password$/i)).toHaveAttribute("type", "password");
  });

  it("editing a site pre-fills baseUrl/authUser but leaves the password blank, and PATCHes on save", async () => {
    renderPage();
    await screen.findByText("tristate-hvac");

    await userEvent.click(screen.getByRole("button", { name: /Edit tristate-hvac/i }));

    expect(screen.getByDisplayValue("https://tristate-hvac.com")).toBeInTheDocument();
    const passwordInput = screen.getByLabelText(/^New WP Application Password$/i);
    expect(passwordInput).toHaveValue("");

    await userEvent.type(passwordInput, "rotated pass");
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rankrocket-mcp/sites/tristate-hvac",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            baseUrl: "https://tristate-hvac.com",
            authUser: "admin",
            appPassword: "rotated pass",
          }),
        })
      )
    );
  });

  it("deleting a site sends a DELETE request", async () => {
    renderPage();
    await screen.findByText("tristate-hvac");

    await userEvent.click(screen.getByRole("button", { name: /Delete tristate-hvac/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/rankrocket-mcp/sites/tristate-hvac",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });
});
