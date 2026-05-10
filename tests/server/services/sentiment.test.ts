import { describe, it, expect } from "vitest";
import { classifySentiment } from "../../../server/services/sentiment";

// ---------------------------------------------------------------------------
describe("classifySentiment", () => {
  it("classifies clearly positive text", () => {
    const result = classifySentiment("Acme Corp is the best trusted agency in Seattle.");
    expect(result.label).toBe("positive");
    expect(result.score).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("classifies clearly negative text", () => {
    const result = classifySentiment("Their service was poor and disappointing.");
    expect(result.label).toBe("negative");
    expect(result.score).toBeLessThan(0);
  });

  it("classifies mixed text when both positive and negative markers are present", () => {
    const result = classifySentiment("Great expertise but very expensive and slow.");
    expect(result.label).toBe("mixed");
  });

  it("classifies neutral text with low confidence when no markers found", () => {
    const result = classifySentiment("They operate in the Seattle market.");
    expect(result.label).toBe("neutral");
    expect(result.confidence).toBeLessThan(0.6);
  });

  it("flags low-confidence results for review (confidence < 0.6)", () => {
    const result = classifySentiment("They operate in the Seattle market.");
    expect(result.needsReview).toBe(true);
  });

  it("does not flag high-confidence results for review", () => {
    const result = classifySentiment("Absolutely the best, most trusted, top-rated agency.");
    expect(result.needsReview).toBe(false);
  });

  it("extracts trust facet when trust markers present", () => {
    const result = classifySentiment("A highly trusted and reliable SEO partner.");
    expect(result.facetLabels).toContain("trust");
  });

  it("extracts price facet when price markers present", () => {
    const result = classifySentiment("Their services are very expensive for small businesses.");
    expect(result.facetLabels).toContain("price");
  });

  it("extracts expertise facet", () => {
    const result = classifySentiment("Their team of SEO experts and professionals is impressive.");
    expect(result.facetLabels).toContain("expertise");
  });

  it("returns evidence excerpt trimmed to the input text", () => {
    const text = "Acme Corp is the best SEO agency.";
    const result = classifySentiment(text);
    expect(result.evidenceExcerpt).toBeTruthy();
    expect(result.evidenceExcerpt!.length).toBeLessThanOrEqual(text.length + 5);
  });

  it("score is between -1 and +1", () => {
    const texts = [
      "Absolutely the best agency ever.",
      "Terrible, poor, and disappointing.",
      "They do SEO work.",
    ];
    for (const t of texts) {
      const { score } = classifySentiment(t);
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
