export const MIN_SECRET_LENGTH = 8;
export const MAX_SECRET_LENGTH = 128;
export const MAX_BATCH = 100;
export const DEFAULT_PULL_LIMIT = 100;
export const MAX_PULL_LIMIT = 500;
export const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MIN_TIMESTAMP = Date.parse("2000-01-01T00:00:00.000Z");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Cursor = { updatedAt: Date; id: string };

export type AccountInput = {
  id: string;
  name: string;
  currency: string;
  openingBalanceCents: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CategoryInput = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type OperationInput = {
  id: string;
  accountId: string;
  categoryId: string | null;
  amountCents: number;
  occurredOn: string;
  label: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type RegisterRequest = { secret: string };

export type PullRequest = {
  vaultId: string;
  secret: string;
  since: Date | null;
  cursors: {
    accounts: Cursor | null;
    categories: Cursor | null;
    operations: Cursor | null;
  };
  limit: number;
};

export type PushRequest = {
  vaultId: string;
  secret: string;
  accounts: AccountInput[];
  categories: CategoryInput[];
  operations: OperationInput[];
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function fail(message: string): ValidationResult<never> {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSecret(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return fail("Le secret doit être une chaîne.");
  if (value.length < MIN_SECRET_LENGTH) {
    return fail("Le secret doit contenir au moins 8 caractères.");
  }
  if (value.length > MAX_SECRET_LENGTH) {
    return fail("Le secret dépasse 128 caractères.");
  }
  return { ok: true, value };
}

function parseVaultId(value: unknown): ValidationResult<string> {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return fail("Identifiant de coffre invalide.");
  }
  return { ok: true, value: value.toLowerCase() };
}

function parseClientId(value: unknown, path: string): ValidationResult<string> {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    return fail(`${path} est invalide.`);
  }
  return { ok: true, value };
}

function parseTimestamp(value: unknown, path: string, now: number): ValidationResult<Date> {
  if (typeof value !== "string" || !value.includes("T")) {
    return fail(`${path} est invalide.`);
  }
  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time) || time < MIN_TIMESTAMP || time > now + MAX_FUTURE_SKEW_MS) {
    return fail(`${path} est invalide.`);
  }
  return { ok: true, value: date };
}

function parseNullableTimestamp(
  value: unknown,
  path: string,
  now: number,
): ValidationResult<Date | null> {
  if (value === null) return { ok: true, value: null };
  return parseTimestamp(value, path, now);
}

function parseName(value: unknown, path: string): ValidationResult<string> {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.includes("\0")) {
    return fail(`${path} est invalide.`);
  }
  return { ok: true, value };
}

function parseInt32(value: unknown, path: string): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fail(`${path} est invalide.`);
  }
  if (value < -2147483648 || value > 2147483647) {
    return fail(`${path} est invalide.`);
  }
  return { ok: true, value };
}

function requireRecord(body: unknown): ValidationResult<Record<string, unknown>> {
  if (!isRecord(body)) return fail("Le corps doit être un objet JSON.");
  return { ok: true, value: body };
}

export function validateRegister(body: unknown): ValidationResult<RegisterRequest> {
  const record = requireRecord(body);
  if (!record.ok) return record;
  const secret = parseSecret(record.value.secret);
  if (!secret.ok) return secret;
  return { ok: true, value: { secret: secret.value } };
}

export function validatePull(body: unknown, now = Date.now()): ValidationResult<PullRequest> {
  const record = requireRecord(body);
  if (!record.ok) return record;
  const vaultId = parseVaultId(record.value.vaultId);
  if (!vaultId.ok) return vaultId;
  const secret = parseSecret(record.value.secret);
  if (!secret.ok) return secret;

  let since: Date | null = null;
  if (record.value.since !== undefined && record.value.since !== null) {
    const parsed = parseTimestamp(record.value.since, "since", now);
    if (!parsed.ok) return parsed;
    since = parsed.value;
  }

  const cursors = parseCursors(record.value.cursors, now);
  if (!cursors.ok) return cursors;

  let limit = DEFAULT_PULL_LIMIT;
  if (record.value.limit !== undefined) {
    const parsed = parseInt32(record.value.limit, "limit");
    if (!parsed.ok) return parsed;
    if (parsed.value < 1 || parsed.value > MAX_PULL_LIMIT) {
      return fail("Limite invalide.");
    }
    limit = parsed.value;
  }

  return {
    ok: true,
    value: {
      vaultId: vaultId.value,
      secret: secret.value,
      since,
      cursors: cursors.value,
      limit,
    },
  };
}

function parseCursors(
  value: unknown,
  now: number,
): ValidationResult<PullRequest["cursors"]> {
  const empty = { accounts: null, categories: null, operations: null };
  if (value === undefined || value === null) return { ok: true, value: empty };
  if (!isRecord(value)) return fail("Curseur invalide.");

  const accounts = parseCursor(value.accounts, "cursors.accounts", now);
  if (!accounts.ok) return accounts;
  const categories = parseCursor(value.categories, "cursors.categories", now);
  if (!categories.ok) return categories;
  const operations = parseCursor(value.operations, "cursors.operations", now);
  if (!operations.ok) return operations;
  return {
    ok: true,
    value: {
      accounts: accounts.value,
      categories: categories.value,
      operations: operations.value,
    },
  };
}

function parseCursor(value: unknown, path: string, now: number): ValidationResult<Cursor | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!isRecord(value)) return fail("Curseur invalide.");
  const updatedAt = parseTimestamp(value.updatedAt, `${path}.updatedAt`, now);
  if (!updatedAt.ok) return updatedAt;
  const id = parseClientId(value.id, `${path}.id`);
  if (!id.ok) return id;
  return { ok: true, value: { updatedAt: updatedAt.value, id: id.value } };
}

export function validatePush(body: unknown, now = Date.now()): ValidationResult<PushRequest> {
  const record = requireRecord(body);
  if (!record.ok) return record;
  const vaultId = parseVaultId(record.value.vaultId);
  if (!vaultId.ok) return vaultId;
  const secret = parseSecret(record.value.secret);
  if (!secret.ok) return secret;

  const accounts = parseList(record.value.accounts, "accounts", (item, index) =>
    parseAccount(item, index, now),
  );
  if (!accounts.ok) return accounts;
  const categories = parseList(record.value.categories, "categories", (item, index) =>
    parseCategory(item, index, now),
  );
  if (!categories.ok) return categories;
  const operations = parseList(record.value.operations, "operations", (item, index) =>
    parseOperation(item, index, now),
  );
  if (!operations.ok) return operations;

  return {
    ok: true,
    value: {
      vaultId: vaultId.value,
      secret: secret.value,
      accounts: accounts.value,
      categories: categories.value,
      operations: operations.value,
    },
  };
}

function parseList<T>(
  value: unknown,
  name: string,
  parseItem: (item: unknown, index: number) => ValidationResult<T>,
): ValidationResult<T[]> {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return fail(`${name} doit être un tableau.`);
  if (value.length > MAX_BATCH) {
    return fail(`Trop d'éléments dans ${name} (${MAX_BATCH} maximum).`);
  }
  const items: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseItem(value[index], index);
    if (!parsed.ok) return parsed;
    items.push(parsed.value);
  }
  return { ok: true, value: items };
}

function parseAccount(value: unknown, index: number, now: number): ValidationResult<AccountInput> {
  const path = `accounts[${index}]`;
  if (!isRecord(value)) return fail(`${path} est invalide.`);
  const id = parseClientId(value.id, `${path}.id`);
  if (!id.ok) return id;
  const name = parseName(value.name, `${path}.name`);
  if (!name.ok) return name;
  if (typeof value.currency !== "string" || !CURRENCY_RE.test(value.currency)) {
    return fail(`${path}.currency est invalide.`);
  }
  const openingBalanceCents = parseInt32(value.openingBalanceCents, `${path}.openingBalanceCents`);
  if (!openingBalanceCents.ok) return openingBalanceCents;
  if (typeof value.archived !== "boolean") return fail(`${path}.archived est invalide.`);
  const stamps = parseStamps(value, path, now);
  if (!stamps.ok) return stamps;
  return {
    ok: true,
    value: {
      id: id.value,
      name: name.value,
      currency: value.currency,
      openingBalanceCents: openingBalanceCents.value,
      archived: value.archived,
      ...stamps.value,
    },
  };
}

function parseCategory(value: unknown, index: number, now: number): ValidationResult<CategoryInput> {
  const path = `categories[${index}]`;
  if (!isRecord(value)) return fail(`${path} est invalide.`);
  const id = parseClientId(value.id, `${path}.id`);
  if (!id.ok) return id;
  const name = parseName(value.name, `${path}.name`);
  if (!name.ok) return name;
  if (value.kind !== "income" && value.kind !== "expense") {
    return fail(`${path}.kind est invalide.`);
  }
  if (!("color" in value)) return fail(`${path}.color est invalide.`);
  if (value.color !== null && (typeof value.color !== "string" || value.color.length < 1 || value.color.length > 32)) {
    return fail(`${path}.color est invalide.`);
  }
  const stamps = parseStamps(value, path, now);
  if (!stamps.ok) return stamps;
  return {
    ok: true,
    value: {
      id: id.value,
      name: name.value,
      kind: value.kind,
      color: value.color,
      ...stamps.value,
    },
  };
}

function parseOperation(value: unknown, index: number, now: number): ValidationResult<OperationInput> {
  const path = `operations[${index}]`;
  if (!isRecord(value)) return fail(`${path} est invalide.`);
  const id = parseClientId(value.id, `${path}.id`);
  if (!id.ok) return id;
  const accountId = parseClientId(value.accountId, `${path}.accountId`);
  if (!accountId.ok) return accountId;
  if (!("categoryId" in value)) return fail(`${path}.categoryId est invalide.`);
  let categoryId: string | null = null;
  if (value.categoryId !== null) {
    const parsed = parseClientId(value.categoryId, `${path}.categoryId`);
    if (!parsed.ok) return parsed;
    categoryId = parsed.value;
  }
  const amountCents = parseInt32(value.amountCents, `${path}.amountCents`);
  if (!amountCents.ok) return amountCents;
  if (typeof value.occurredOn !== "string" || !DATE_ONLY_RE.test(value.occurredOn)) {
    return fail(`${path}.occurredOn est invalide.`);
  }
  const occurred = new Date(`${value.occurredOn}T00:00:00.000Z`);
  if (Number.isNaN(occurred.getTime()) || occurred.toISOString().slice(0, 10) !== value.occurredOn) {
    return fail(`${path}.occurredOn est invalide.`);
  }
  if (typeof value.label !== "string" || value.label.length > 200 || value.label.includes("\0")) {
    return fail(`${path}.label est invalide.`);
  }
  if (!("note" in value)) return fail(`${path}.note est invalide.`);
  if (value.note !== null && (typeof value.note !== "string" || value.note.length > 2000 || value.note.includes("\0"))) {
    return fail(`${path}.note est invalide.`);
  }
  const stamps = parseStamps(value, path, now);
  if (!stamps.ok) return stamps;
  return {
    ok: true,
    value: {
      id: id.value,
      accountId: accountId.value,
      categoryId,
      amountCents: amountCents.value,
      occurredOn: value.occurredOn,
      label: value.label,
      note: value.note,
      ...stamps.value,
    },
  };
}

function parseStamps(
  value: Record<string, unknown>,
  path: string,
  now: number,
): ValidationResult<{ createdAt: Date; updatedAt: Date; deletedAt: Date | null }> {
  const createdAt = parseTimestamp(value.createdAt, `${path}.createdAt`, now);
  if (!createdAt.ok) return createdAt;
  const updatedAt = parseTimestamp(value.updatedAt, `${path}.updatedAt`, now);
  if (!updatedAt.ok) return updatedAt;
  if (!("deletedAt" in value)) return fail(`${path}.deletedAt est invalide.`);
  const deletedAt = parseNullableTimestamp(value.deletedAt, `${path}.deletedAt`, now);
  if (!deletedAt.ok) return deletedAt;
  return {
    ok: true,
    value: {
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      deletedAt: deletedAt.value,
    },
  };
}
