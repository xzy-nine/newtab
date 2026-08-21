import { describe, it, expect } from "vitest";
import {
  normalizeBrowserUrl,
  isLoopbackHostname,
  embeddabilityOf,
  extractFrameAncestors,
  type BrowserProbeResult,
} from "./browser";

describe("normalizeBrowserUrl", () => {
  it("rejects empty input", () => {
    expect(normalizeBrowserUrl("")).toEqual({ kind: "invalid" });
    expect(normalizeBrowserUrl("   ")).toEqual({ kind: "invalid" });
  });

  it("prepends https:// to a bare host", () => {
    expect(normalizeBrowserUrl("example.com")).toEqual({
      kind: "ok",
      url: "https://example.com/",
    });
  });

  it("keeps an explicit http(s) scheme", () => {
    expect(normalizeBrowserUrl("http://example.com")).toEqual({
      kind: "ok",
      url: "http://example.com/",
    });
    expect(normalizeBrowserUrl("https://example.com/a?b=1")).toEqual({
      kind: "ok",
      url: "https://example.com/a?b=1",
    });
  });

  it("treats host:port as a host, not a scheme", () => {
    expect(normalizeBrowserUrl("example.com:8080")).toEqual({
      kind: "ok",
      url: "https://example.com:8080/",
    });
  });

  it("blocks forbidden schemes", () => {
    expect(normalizeBrowserUrl("javascript:alert(1)")).toEqual({
      kind: "blocked",
      reason: "scheme",
    });
    expect(normalizeBrowserUrl("data:text/html,hi")).toEqual({
      kind: "blocked",
      reason: "scheme",
    });
    expect(normalizeBrowserUrl("file:///etc/passwd")).toEqual({
      kind: "blocked",
      reason: "scheme",
    });
  });

  it("blocks non-http(s) schemes that carry a // (ftp, ws, wss)", () => {
    expect(normalizeBrowserUrl("ftp://example.com")).toEqual({
      kind: "blocked",
      reason: "scheme",
    });
    expect(normalizeBrowserUrl("ws://example.com")).toEqual({
      kind: "blocked",
      reason: "scheme",
    });
  });

  it("blocks loopback hosts", () => {
    expect(normalizeBrowserUrl("localhost")).toEqual({
      kind: "blocked",
      reason: "loopback",
    });
    expect(normalizeBrowserUrl("127.0.0.1")).toEqual({
      kind: "blocked",
      reason: "loopback",
    });
    expect(normalizeBrowserUrl("http://[::1]")).toEqual({
      kind: "blocked",
      reason: "loopback",
    });
  });
});

describe("isLoopbackHostname", () => {
  it("detects localhost and IPv6 loopback", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("0.0.0.0")).toBe(true);
  });

  it("detects 127.0.0.0/8", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("127.255.255.254")).toBe(true);
  });

  it("rejects non-loopback hosts", () => {
    expect(isLoopbackHostname("example.com")).toBe(false);
    expect(isLoopbackHostname("128.0.0.1")).toBe(false);
    expect(isLoopbackHostname("127.0.0.1.1")).toBe(false);
  });
});

describe("embeddabilityOf", () => {
  const base: BrowserProbeResult = { reachable: true };

  it("returns unknown when unreachable", () => {
    expect(embeddabilityOf({ reachable: false })).toBe("unknown");
  });

  it("blocks on X-Frame-Options DENY / SAMEORIGIN", () => {
    expect(embeddabilityOf({ ...base, xFrameOptions: "DENY" })).toBe("blocked");
    expect(embeddabilityOf({ ...base, xFrameOptions: "SAMEORIGIN" })).toBe("blocked");
    expect(embeddabilityOf({ ...base, xFrameOptions: "sameorigin" })).toBe("blocked");
  });

  it("is embeddable when X-Frame-Options is absent or permissive", () => {
    expect(embeddabilityOf(base)).toBe("embeddable");
    expect(embeddabilityOf({ ...base, xFrameOptions: "ALLOWFROM https://a.com" })).toBe(
      "embeddable",
    );
  });

  it("blocks frame-ancestors without *", () => {
    expect(embeddabilityOf({ ...base, frameAncestors: ["'self'"] })).toBe("blocked");
    expect(embeddabilityOf({ ...base, frameAncestors: ["https://a.com"] })).toBe("blocked");
  });

  it("is embeddable when frame-ancestors allows *", () => {
    expect(embeddabilityOf({ ...base, frameAncestors: ["*"] })).toBe("embeddable");
  });
});

describe("extractFrameAncestors", () => {
  it("returns undefined for a null or absent directive", () => {
    expect(extractFrameAncestors(null)).toBeUndefined();
    expect(extractFrameAncestors("default-src 'self'")).toBeUndefined();
  });

  it("parses the frame-ancestors source list", () => {
    expect(
      extractFrameAncestors("default-src 'self'; frame-ancestors 'self' https://a.com"),
    ).toEqual(["'self'", "https://a.com"]);
    expect(extractFrameAncestors("frame-ancestors *")).toEqual(["*"]);
  });

  it("returns undefined for an empty frame-ancestors directive", () => {
    expect(extractFrameAncestors("frame-ancestors ; default-src *")).toBeUndefined();
  });
});
