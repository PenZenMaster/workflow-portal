/**
 * Calibration harness — fails the build if parser/scorer drift below thresholds.
 *
 * Thresholds (from the AI Visibility spec):
 *   - Mention detection : precision ≥ 0.85, recall ≥ 0.85
 *   - Citation detection: precision ≥ 0.90, recall ≥ 0.90
 *   - Sentiment labelling: accuracy ≥ 0.70
 */
import { describe, it, expect } from "vitest";
import { parseResponse } from "../../server/services/parser";
import { classifySentiment } from "../../server/services/sentiment";
import {
  FIXTURES,
  CLIENT_BRAND,
  COMPETITOR_BRAND,
} from "./fixtures";

const BRANDS = [CLIENT_BRAND, COMPETITOR_BRAND];

const MENTION_PRECISION_THRESHOLD = 0.85;
const MENTION_RECALL_THRESHOLD = 0.85;
const CITATION_PRECISION_THRESHOLD = 0.90;
const CITATION_RECALL_THRESHOLD = 0.90;
const SENTIMENT_ACCURACY_THRESHOLD = 0.70;

describe("Calibration — parser precision/recall", () => {
  it("meets mention detection thresholds", () => {
    let tp = 0; // correctly detected client mention
    let fp = 0; // detected when none expected
    let fn = 0; // missed when one expected

    for (const fixture of FIXTURES) {
      const result = parseResponse(fixture.responseText, fixture.citations, BRANDS);
      const detected = result.mentions.some((m) => m.brandId === CLIENT_BRAND.id);

      if (fixture.expectClientMention && detected) tp++;
      else if (!fixture.expectClientMention && detected) fp++;
      else if (fixture.expectClientMention && !detected) fn++;
    }

    const precision = tp / (tp + fp) || 1; // no false positives = perfect precision
    const recall = tp / (tp + fn) || 0;

    expect(precision).toBeGreaterThanOrEqual(MENTION_PRECISION_THRESHOLD);
    expect(recall).toBeGreaterThanOrEqual(MENTION_RECALL_THRESHOLD);
  });

  it("meets citation detection thresholds", () => {
    let tp = 0;
    let fp = 0;
    let fn = 0;

    for (const fixture of FIXTURES) {
      const result = parseResponse(fixture.responseText, fixture.citations, BRANDS);
      const detected = result.citations.some((c) => c.ownedByBrandId === CLIENT_BRAND.id);

      if (fixture.expectClientCitation && detected) tp++;
      else if (!fixture.expectClientCitation && detected) fp++;
      else if (fixture.expectClientCitation && !detected) fn++;
    }

    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);

    expect(precision).toBeGreaterThanOrEqual(CITATION_PRECISION_THRESHOLD);
    expect(recall).toBeGreaterThanOrEqual(CITATION_RECALL_THRESHOLD);
  });

  it("meets sentiment classification accuracy threshold", () => {
    const sentimentFixtures = FIXTURES.filter(
      (f) => f.expectClientMention && f.expectedSentiment !== null
    );

    let correct = 0;
    for (const fixture of sentimentFixtures) {
      const result = parseResponse(fixture.responseText, fixture.citations, BRANDS);
      const excerpt = result.mentions
        .filter((m) => m.brandId === CLIENT_BRAND.id)
        .map((m) => m.evidenceExcerpt ?? "")
        .join(" ");
      const context = excerpt || fixture.responseText.slice(0, 300);
      const sentiment = classifySentiment(context);
      if (sentiment.label === fixture.expectedSentiment) correct++;
    }

    const accuracy = correct / sentimentFixtures.length;
    expect(accuracy).toBeGreaterThanOrEqual(SENTIMENT_ACCURACY_THRESHOLD);
  });
});
