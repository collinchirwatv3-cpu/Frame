import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./is-typing-target";

describe("isTypingTarget", () => {
  it("is false for null", () => {
    expect(isTypingTarget(null)).toBe(false);
  });

  it("is true for an input", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
  });

  it("is true for a textarea", () => {
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
  });

  it("is true for a contenteditable element", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isTypingTarget(div)).toBe(true);
  });

  it("is false for a plain button or div", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });
});
