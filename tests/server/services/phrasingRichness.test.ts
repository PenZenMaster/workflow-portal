/*
 * Module/Script Name: phrasingRichness.test.ts
 * Path: tests/server/services/phrasingRichness.test.ts
 *
 * Description:
 * Tests for issue #27 - phrasing/context-richness scoring. Deterministic
 * heuristic (locked with the user 2026-07-30 over an LLM-as-judge
 * alternative): a prompt is context_rich when it clears at least 2 of 3
 * signals (word count >= 8, question-form/first-person phrasing, a
 * contextual qualifier keyword), else keyword_style.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-30
 * Last Modified Date: 2026-07-30
 * Comments:
 * - v1.00 issue #27 initial implementation
 */

import { describe, it, expect } from "vitest";
import { scorePhrasingRichness } from "../../../server/services/phrasingRichness";

describe("scorePhrasingRichness", () => {
  it("classifies the issue's keyword-style example as keyword_style", () => {
    expect(scorePhrasingRichness("Portable restroom rental in San Francisco")).toBe("keyword_style");
  });

  it("classifies the issue's persona-rich example as context_rich", () => {
    expect(
      scorePhrasingRichness(
        "I'm planning a 200-person outdoor wedding in San Francisco. How many portable restrooms do I need and who provides luxury trailers?"
      )
    ).toBe("context_rich");
  });

  it("classifies a long prompt with question-form phrasing but no qualifier as context_rich (2 of 3 signals)", () => {
    expect(scorePhrasingRichness("How many different plumbing companies operate near downtown Seattle right now")).toBe("context_rich");
  });

  it("classifies a short question as keyword_style (only 1 of 3 signals)", () => {
    expect(scorePhrasingRichness("Who repairs water heaters?")).toBe("keyword_style");
  });

  it("classifies a long prompt with no question/first-person and no qualifier as keyword_style (1 of 3 signals)", () => {
    expect(scorePhrasingRichness("Commercial roofing contractors specializing in flat roof replacement services nationwide")).toBe(
      "keyword_style"
    );
  });
});
