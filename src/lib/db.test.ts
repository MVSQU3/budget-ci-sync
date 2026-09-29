import { describe, expect, it } from "vitest";
import { withServerlessParams } from "@/lib/db-url";

describe("database url", () => {
  it("adds pooler settings without dropping the existing query string", () => {
    const url = withServerlessParams(
      "postgresql://placeholder:placeholder@ep-example-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("pgbouncer")).toBe("true");
    expect(parsed.searchParams.get("connection_limit")).toBe("1");
    expect(parsed.searchParams.get("connect_timeout")).toBe("15");
    expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(parsed.password).toBe("placeholder");
  });

  it("leaves an unpooled host without the pgbouncer flag", () => {
    const url = withServerlessParams(
      "postgresql://placeholder:placeholder@ep-example.us-east-1.aws.neon.tech/neondb",
    );
    expect(new URL(url).searchParams.has("pgbouncer")).toBe(false);
  });
});
