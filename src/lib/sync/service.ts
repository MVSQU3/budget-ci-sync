import { Prisma, type Account, type Category, type Operation } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DUMMY_HASH, DUMMY_SALT, hashSecret, verifySecret } from "@/lib/auth/secret";
import { readPepper } from "@/lib/config";
import { getPrisma } from "@/lib/db";
import { clientIp, json, readJson } from "@/lib/http";
import {
  AUTH_FAIL_LIMIT,
  REGISTER_LIMIT,
  SYNC_LIMIT,
  syncLimiter,
} from "@/lib/rate-limit";
import { lwwWhere } from "@/lib/sync/lww";
import {
  validatePull,
  validatePush,
  validateRegister,
  type Cursor,
} from "@/lib/sync/validate";

type RowStamp = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const TOO_MANY = "Trop de tentatives. Réessayez plus tard.";
const UNAUTHORIZED = "Secret incorrect.";
const MISCONFIGURED = "Configuration serveur incomplète.";

export async function handleRegister(request: Request): Promise<Response> {
  const ip = clientIp(request);
  if (!syncLimiter.allow(`register:${ip}`, REGISTER_LIMIT.limit, REGISTER_LIMIT.windowMs)) {
    return json({ error: TOO_MANY }, 429);
  }
  const body = await readJson(request);
  if (!body.ok) return json({ error: body.message }, 400);
  const parsed = validateRegister(body.value);
  if (!parsed.ok) return json({ error: parsed.message }, 400);

  const pepper = readPepper();
  if (!pepper) return json({ error: MISCONFIGURED }, 500);

  const { secretHash, secretSalt } = await hashSecret(parsed.value.secret, pepper);
  const vaultId = randomUUID();
  const serverTime = new Date();
  await getPrisma().vault.create({
    data: { id: vaultId, secretHash, secretSalt },
  });
  return json({ vaultId, serverTime: serverTime.toISOString() }, 201);
}

export async function handlePull(request: Request): Promise<Response> {
  const gate = await gateSync(request, validatePull);
  if (!gate.ok) return gate.response;
  const { vaultId, since, cursors, limit } = gate.value;
  const serverTime = new Date();
  const prisma = getPrisma();

  const [accounts, categories, operations] = await Promise.all([
    prisma.account.findMany({
      where: { vaultId, ...afterWatermark(cursors.accounts, since) },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    }),
    prisma.category.findMany({
      where: { vaultId, ...afterWatermark(cursors.categories, since) },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    }),
    prisma.operation.findMany({
      where: { vaultId, ...afterWatermark(cursors.operations, since) },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    }),
  ]);

  const accountsPage = page(accounts, limit, serializeAccount);
  const categoriesPage = page(categories, limit, serializeCategory);
  const operationsPage = page(operations, limit, serializeOperation);

  return json(
    {
      serverTime: serverTime.toISOString(),
      accounts: accountsPage.items,
      categories: categoriesPage.items,
      operations: operationsPage.items,
      cursors: {
        accounts: accountsPage.cursor,
        categories: categoriesPage.cursor,
        operations: operationsPage.cursor,
      },
      hasMore: {
        accounts: accountsPage.hasMore,
        categories: categoriesPage.hasMore,
        operations: operationsPage.hasMore,
      },
    },
    200,
  );
}

export async function handlePush(request: Request): Promise<Response> {
  const gate = await gateSync(request, validatePush);
  if (!gate.ok) return gate.response;
  const { vaultId, accounts, categories, operations } = gate.value;
  const serverTime = new Date();
  const applied = { accounts: [] as string[], categories: [] as string[], operations: [] as string[] };
  const kept = { accounts: [] as string[], categories: [] as string[], operations: [] as string[] };

  await getPrisma().$transaction(
    async (tx) => {
      for (const account of accounts) {
        const count = await tx.$executeRaw`
          INSERT INTO "Account" (
            "vaultId", "id", "name", "currency", "openingBalanceCents", "archived",
            "createdAt", "updatedAt", "deletedAt"
          ) VALUES (
            CAST(${vaultId} AS uuid),
            ${account.id},
            ${account.name},
            ${account.currency},
            ${account.openingBalanceCents},
            ${account.archived},
            ${account.createdAt},
            ${account.updatedAt},
            ${account.deletedAt}
          )
          ON CONFLICT ("vaultId", "id") DO UPDATE SET
            "name" = EXCLUDED."name",
            "currency" = EXCLUDED."currency",
            "openingBalanceCents" = EXCLUDED."openingBalanceCents",
            "archived" = EXCLUDED."archived",
            "updatedAt" = EXCLUDED."updatedAt",
            "deletedAt" = EXCLUDED."deletedAt"
          WHERE ${Prisma.raw(lwwWhere("Account"))}
        `;
        (count > 0 ? applied : kept).accounts.push(account.id);
      }
      for (const category of categories) {
        const count = await tx.$executeRaw`
          INSERT INTO "Category" (
            "vaultId", "id", "name", "kind", "color",
            "createdAt", "updatedAt", "deletedAt"
          ) VALUES (
            CAST(${vaultId} AS uuid),
            ${category.id},
            ${category.name},
            ${category.kind},
            ${category.color},
            ${category.createdAt},
            ${category.updatedAt},
            ${category.deletedAt}
          )
          ON CONFLICT ("vaultId", "id") DO UPDATE SET
            "name" = EXCLUDED."name",
            "kind" = EXCLUDED."kind",
            "color" = EXCLUDED."color",
            "updatedAt" = EXCLUDED."updatedAt",
            "deletedAt" = EXCLUDED."deletedAt"
          WHERE ${Prisma.raw(lwwWhere("Category"))}
        `;
        (count > 0 ? applied : kept).categories.push(category.id);
      }
      for (const operation of operations) {
        const occurredOn = new Date(`${operation.occurredOn}T00:00:00.000Z`);
        const count = await tx.$executeRaw`
          INSERT INTO "Operation" (
            "vaultId", "id", "accountId", "categoryId", "amountCents", "occurredOn",
            "label", "note", "createdAt", "updatedAt", "deletedAt"
          ) VALUES (
            CAST(${vaultId} AS uuid),
            ${operation.id},
            ${operation.accountId},
            ${operation.categoryId},
            ${operation.amountCents},
            CAST(${occurredOn} AS date),
            ${operation.label},
            ${operation.note},
            ${operation.createdAt},
            ${operation.updatedAt},
            ${operation.deletedAt}
          )
          ON CONFLICT ("vaultId", "id") DO UPDATE SET
            "accountId" = EXCLUDED."accountId",
            "categoryId" = EXCLUDED."categoryId",
            "amountCents" = EXCLUDED."amountCents",
            "occurredOn" = EXCLUDED."occurredOn",
            "label" = EXCLUDED."label",
            "note" = EXCLUDED."note",
            "updatedAt" = EXCLUDED."updatedAt",
            "deletedAt" = EXCLUDED."deletedAt"
          WHERE ${Prisma.raw(lwwWhere("Operation"))}
        `;
        (count > 0 ? applied : kept).operations.push(operation.id);
      }
    },
    { timeout: 15_000, maxWait: 15_000 },
  );

  return json({ serverTime: serverTime.toISOString(), applied, kept }, 200);
}

async function gateSync<T extends { vaultId: string; secret: string }>(
  request: Request,
  validate: (body: unknown) => { ok: true; value: T } | { ok: false; message: string },
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const ip = clientIp(request);
  if (!syncLimiter.allow(`sync:${ip}`, SYNC_LIMIT.limit, SYNC_LIMIT.windowMs)) {
    return { ok: false, response: json({ error: TOO_MANY }, 429) };
  }
  if (syncLimiter.isLimited(`authfail:${ip}`, AUTH_FAIL_LIMIT.limit, AUTH_FAIL_LIMIT.windowMs)) {
    return { ok: false, response: json({ error: TOO_MANY }, 429) };
  }

  const body = await readJson(request);
  if (!body.ok) return { ok: false, response: json({ error: body.message }, 400) };
  const parsed = validate(body.value);
  if (!parsed.ok) return { ok: false, response: json({ error: parsed.message }, 400) };

  const auth = await authenticate(parsed.value.vaultId, parsed.value.secret);
  if (auth === "misconfigured") {
    return { ok: false, response: json({ error: MISCONFIGURED }, 500) };
  }
  if (auth === "unauthorized") {
    syncLimiter.allow(`authfail:${ip}`, AUTH_FAIL_LIMIT.limit, AUTH_FAIL_LIMIT.windowMs);
    return { ok: false, response: json({ error: UNAUTHORIZED }, 401) };
  }
  return { ok: true, value: parsed.value };
}

async function authenticate(
  vaultId: string,
  secret: string,
): Promise<"ok" | "unauthorized" | "misconfigured"> {
  const pepper = readPepper();
  if (!pepper) return "misconfigured";
  const vault = await getPrisma().vault.findUnique({
    where: { id: vaultId },
    select: { secretHash: true, secretSalt: true },
  });
  const matches = await verifySecret(
    secret,
    vault?.secretHash ?? DUMMY_HASH,
    vault?.secretSalt ?? DUMMY_SALT,
    pepper,
  );
  if (!vault || !matches) return "unauthorized";
  return "ok";
}

function afterWatermark(cursor: Cursor | null, since: Date | null) {
  if (cursor) {
    return {
      OR: [
        { updatedAt: { gt: cursor.updatedAt } },
        { AND: [{ updatedAt: cursor.updatedAt }, { id: { gt: cursor.id } }] },
      ],
    };
  }
  if (since) return { updatedAt: { gt: since } };
  return {};
}

function page<T extends RowStamp, R>(
  rows: T[],
  limit: number,
  serialize: (row: T) => R,
): { items: R[]; cursor: { updatedAt: string; id: string } | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible[visible.length - 1];
  return {
    items: visible.map(serialize),
    hasMore,
    cursor: last ? { updatedAt: last.updatedAt.toISOString(), id: last.id } : null,
  };
}

function serializeAccount(row: Account) {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    openingBalanceCents: row.openingBalanceCents,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: isoOrNull(row.deletedAt),
  };
}

function serializeCategory(row: Category) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: isoOrNull(row.deletedAt),
  };
}

function serializeOperation(row: Operation) {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    amountCents: row.amountCents,
    occurredOn: dateOnly(row.occurredOn),
    label: row.label,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: isoOrNull(row.deletedAt),
  };
}

function isoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function dateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
