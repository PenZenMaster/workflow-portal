import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "index.css"), "utf8");

describe("index.css dark-mode native picker icons", () => {
  it.each(["date", "datetime-local", "month", "time", "week"])(
    "inverts the %s picker indicator to white under .dark",
    (type) => {
      const rule = new RegExp(
        String.raw`\.dark\s+input\[type="${type}"\]::-webkit-calendar-picker-indicator\s*[,{]`
      );
      expect(css).toMatch(rule);
    }
  );

  it("applies an invert filter to the indicator", () => {
    expect(css).toMatch(/::-webkit-calendar-picker-indicator\s*\{[^}]*filter:\s*invert\(1\)/);
  });
});
