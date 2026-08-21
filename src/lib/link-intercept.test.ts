import { describe, it, expect } from "vitest";
import { shouldInterceptLink, isPlainLeftClick } from "./link-intercept";

const SELF = "chrome-extension://abcdefg";

describe("shouldInterceptLink", () => {
  it("returns the http(s) absolute URL for external links", () => {
    expect(shouldInterceptLink("https://example.com/a", SELF)).toBe("https://example.com/a");
    expect(shouldInterceptLink("http://example.com", SELF)).toBe("http://example.com/");
  });

  it("returns null for non-http(s) links", () => {
    expect(shouldInterceptLink("javascript:alert(1)", SELF)).toBeNull();
    expect(shouldInterceptLink("mailto:a@b.com", SELF)).toBeNull();
    expect(shouldInterceptLink("#fragment", SELF)).toBeNull();
  });

  it("returns null for same-origin (extension internal) links", () => {
    expect(shouldInterceptLink("chrome-extension://abcdefg/sidepanel.html", SELF)).toBeNull();
  });

  it("returns null for unparsable hrefs", () => {
    expect(shouldInterceptLink("not a url", SELF)).toBeNull();
  });
});

describe("isPlainLeftClick", () => {
  it("is true only for an unmodified left click", () => {
    expect(
      isPlainLeftClick({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBe(true);
  });

  it("is false for modified clicks or non-left buttons", () => {
    const base = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(isPlainLeftClick({ ...base, ctrlKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...base, metaKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...base, shiftKey: true })).toBe(false);
    expect(isPlainLeftClick({ ...base, button: 1 })).toBe(false);
  });
});
