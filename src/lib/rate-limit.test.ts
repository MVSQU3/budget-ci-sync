import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows a burst then blocks until the window resets", () => {
    let time = 1_000;
    const limiter = createRateLimiter(() => time);
    expect(limiter.allow("register:1.2.3.4", 2, 1_000)).toBe(true);
    expect(limiter.allow("register:1.2.3.4", 2, 1_000)).toBe(true);
    expect(limiter.allow("register:1.2.3.4", 2, 1_000)).toBe(false);
    expect(limiter.isLimited("register:1.2.3.4", 2, 1_000)).toBe(true);
    expect(limiter.allow("register:5.6.7.8", 2, 1_000)).toBe(true);
    time += 1_000;
    expect(limiter.allow("register:1.2.3.4", 2, 1_000)).toBe(true);
  });
});
