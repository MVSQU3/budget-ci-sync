import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAfterWatermark } from "@/lib/sync/cursor";
import { decideLww, lwwWhere } from "@/lib/sync/lww";

const older = new Date("2026-01-01T00:00:00.000Z");
const newer = new Date("2026-06-01T00:00:00.000Z");

describe("last-write-wins", () => {
  it("applies when the server has no row", () => {
    expect(decideLww(older, null)).toBe("apply");
  });

  it("applies when the incoming updatedAt is newer", () => {
    expect(decideLww(newer, older)).toBe("apply");
    expect(decideLww(new Date(older.getTime() + 1), older)).toBe("apply");
  });

  it("keeps the server row when the incoming updatedAt is older", () => {
    expect(decideLww(older, newer)).toBe("keep");
  });

  it("keeps the server row when the timestamps are equal", () => {
    expect(decideLww(older, new Date(older.getTime()))).toBe("keep");
  });

  it("encodes the same strict comparison in the upsert predicate", () => {
    expect(lwwWhere("Account")).toBe(`"Account"."updatedAt" < EXCLUDED."updatedAt"`);
    expect(lwwWhere("Category")).toContain(`"Category"."updatedAt" <`);
    expect(lwwWhere("Operation")).toContain(`"Operation"."updatedAt" <`);
  });
});

describe("migration", () => {
  it("uses a composite primary key of vaultId and id for each synced entity", () => {
    const sql = readFileSync("prisma/migrations/20260929120000_init/migration.sql", "utf8");
    for (const table of ["Account", "Category", "Operation"]) {
      expect(sql).toContain(`CONSTRAINT "${table}_pkey" PRIMARY KEY ("vaultId","id")`);
    }
  });
});

describe("pull watermark", () => {
  it("treats since as an exclusive timestamp", () => {
    expect(isAfterWatermark({ updatedAt: newer, id: "a" }, older)).toBe(true);
    expect(isAfterWatermark({ updatedAt: older, id: "a" }, older)).toBe(false);
  });

  it("orders ties by id so a cursor does not skip or repeat the boundary row", () => {
    const cursor = { updatedAt: older, id: "b" };
    expect(isAfterWatermark({ updatedAt: older, id: "c" }, cursor)).toBe(true);
    expect(isAfterWatermark({ updatedAt: older, id: "b" }, cursor)).toBe(false);
    expect(isAfterWatermark({ updatedAt: older, id: "a" }, cursor)).toBe(false);
  });
});
