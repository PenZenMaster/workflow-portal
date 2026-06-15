import { describe, it, expect } from "vitest";
import { buildPromptTokenContext, expandPromptText } from "../../../server/services/promptTokens";

describe("promptTokens", () => {
  describe("expandPromptText", () => {
    it("returns the text unchanged when it contains no tokens", () => {
      const ctx = { brand: "Acme", competitors: ["Globex"], geo: "Seattle, WA" };
      expect(expandPromptText("Best plumber near me", ctx)).toEqual(["Best plumber near me"]);
    });

    it("substitutes {{brand}} with the client's brand name", () => {
      const ctx = { brand: "Acme Plumbing", competitors: [], geo: null };
      expect(expandPromptText("Is {{brand}} a good choice?", ctx)).toEqual([
        "Is Acme Plumbing a good choice?",
      ]);
    });

    it("substitutes both {{city}} and {{geo}} with the resolved geo value", () => {
      const ctx = { brand: "Acme", competitors: [], geo: "Seattle, WA" };
      expect(expandPromptText("Best plumber in {{city}} vs {{geo}}", ctx)).toEqual([
        "Best plumber in Seattle, WA vs Seattle, WA",
      ]);
    });

    it("substitutes {{city}}/{{geo}} with an empty string when geo is null", () => {
      const ctx = { brand: "Acme", competitors: [], geo: null };
      expect(expandPromptText("Best plumber in {{city}}", ctx)).toEqual(["Best plumber in "]);
    });

    it("fans out {{competitor}} into one variant per configured competitor", () => {
      const ctx = { brand: "Acme", competitors: ["Globex", "Initech"], geo: null };
      expect(expandPromptText("Alternatives to {{competitor}}", ctx)).toEqual([
        "Alternatives to Globex",
        "Alternatives to Initech",
      ]);
    });

    it("substitutes {{competitor}} with an empty string when no competitors are configured", () => {
      const ctx = { brand: "Acme", competitors: [], geo: null };
      expect(expandPromptText("Alternatives to {{competitor}}", ctx)).toEqual(["Alternatives to "]);
    });

    it("substitutes {{brand}} and fans out {{competitor}} together", () => {
      const ctx = { brand: "Acme", competitors: ["Globex", "Initech"], geo: null };
      expect(expandPromptText("Is {{brand}} better than {{competitor}}?", ctx)).toEqual([
        "Is Acme better than Globex?",
        "Is Acme better than Initech?",
      ]);
    });

    it("substitutes every occurrence of {{competitor}} with the same name in each fanned-out variant", () => {
      const ctx = { brand: "Acme", competitors: ["Globex", "Initech"], geo: null };
      expect(expandPromptText("{{competitor}} vs {{competitor}}", ctx)).toEqual([
        "Globex vs Globex",
        "Initech vs Initech",
      ]);
    });
  });

  describe("buildPromptTokenContext", () => {
    it("uses the prompt's own geo when set", () => {
      const client = { brand: "Acme", competitors: ["Globex"], geographies: ["Portland, OR"] };
      expect(buildPromptTokenContext(client, "Seattle, WA")).toEqual({
        brand: "Acme",
        competitors: ["Globex"],
        geo: "Seattle, WA",
      });
    });

    it("falls back to the client's first geography when the prompt has no geo", () => {
      const client = { brand: "Acme", competitors: ["Globex"], geographies: ["Portland, OR", "Seattle, WA"] };
      expect(buildPromptTokenContext(client, null)).toEqual({
        brand: "Acme",
        competitors: ["Globex"],
        geo: "Portland, OR",
      });
    });

    it("resolves geo to null when neither the prompt nor the client has a geography", () => {
      const client = { brand: "Acme", competitors: [], geographies: [] };
      expect(buildPromptTokenContext(client, null)).toEqual({
        brand: "Acme",
        competitors: [],
        geo: null,
      });
    });
  });
});
