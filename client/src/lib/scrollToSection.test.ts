import { describe, it, expect, vi, afterEach } from "vitest";
import { scrollToSection } from "./scrollToSection";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("scrollToSection", () => {
  it("smooth-scrolls the element with the given id into view", () => {
    const el = document.createElement("div");
    el.id = "target-section";
    document.body.appendChild(el);
    const spy = vi.spyOn(el, "scrollIntoView").mockImplementation(() => {});

    scrollToSection("target-section");

    expect(spy).toHaveBeenCalledWith({ behavior: "smooth" });
  });

  it("does nothing (no throw) when no element with that id exists", () => {
    expect(() => scrollToSection("missing-section")).not.toThrow();
  });
});
