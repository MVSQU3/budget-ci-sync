export type LwwDecision = "apply" | "keep";

/**
 * Last-write-wins on `updatedAt`.
 * Apply only when the incoming timestamp is strictly newer than the stored one.
 * A missing server row is applied. Equal timestamps keep the server row.
 *
 * The SQL upsert uses the same rule:
 * `"Table"."updatedAt" < EXCLUDED."updatedAt"`.
 */
export function decideLww(
  incomingUpdatedAt: Date,
  serverUpdatedAt: Date | null,
): LwwDecision {
  if (serverUpdatedAt === null) return "apply";
  if (incomingUpdatedAt.getTime() > serverUpdatedAt.getTime()) return "apply";
  return "keep";
}

const LWW_TABLES = ["Account", "Category", "Operation"] as const;
export type LwwTable = (typeof LWW_TABLES)[number];

/** SQL predicate inserted with Prisma.raw. Identifiers come only from LwwTable. */
export function lwwWhere(table: LwwTable): string {
  return `"${table}"."updatedAt" < EXCLUDED."updatedAt"`;
}
