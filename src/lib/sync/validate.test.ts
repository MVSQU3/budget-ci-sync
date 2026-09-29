import { describe, expect, it } from "vitest";
import { validatePull, validatePush, validateRegister } from "@/lib/sync/validate";

const now = Date.parse("2026-09-29T12:00:00.000Z");
const vaultId = "11111111-1111-4111-8111-111111111111";
const stamp = {
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  deletedAt: null,
};

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc_1",
    name: "Courant",
    currency: "EUR",
    openingBalanceCents: 12_50,
    archived: false,
    ...stamp,
    ...overrides,
  };
}

function category(overrides: Record<string, unknown> = {}) {
  return {
    id: "cat_1",
    name: "Courses",
    kind: "expense",
    color: null,
    ...stamp,
    ...overrides,
  };
}

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: "op_1",
    accountId: "acc_1",
    categoryId: "cat_1",
    amountCents: -1990,
    occurredOn: "2026-09-15",
    label: "Marché",
    note: null,
    ...stamp,
    ...overrides,
  };
}

describe("validation", () => {
  it("accepts a register secret of at least 8 characters", () => {
    const result = validateRegister({ secret: "ABCD1234" });
    expect(result.ok).toBe(true);
  });

  it("rejects a short secret, a non-string secret, and a non-object body", () => {
    expect(validateRegister({ secret: "short" })).toMatchObject({
      ok: false,
      message: "Le secret doit contenir au moins 8 caractères.",
    });
    expect(validateRegister({ secret: 12345678 })).toMatchObject({
      ok: false,
      message: "Le secret doit être une chaîne.",
    });
    expect(validateRegister(["ABCD1234"])).toMatchObject({
      ok: false,
      message: "Le corps doit être un objet JSON.",
    });
  });

  it("rejects a pull without a vault id, a bad limit, and a bad cursor", () => {
    expect(validatePull({ secret: "ABCD1234" }, now)).toMatchObject({
      ok: false,
      message: "Identifiant de coffre invalide.",
    });
    expect(validatePull({ vaultId, secret: "ABCD1234", limit: 0 }, now)).toMatchObject({
      ok: false,
      message: "Limite invalide.",
    });
    expect(validatePull({ vaultId, secret: "ABCD1234", limit: 10.5 }, now).ok).toBe(false);
    expect(
      validatePull(
        { vaultId, secret: "ABCD1234", cursors: { accounts: { updatedAt: "yesterday", id: "a" } } },
        now,
      ).ok,
    ).toBe(false);
    expect(validatePull({ vaultId, secret: "ABCD1234", since: "2026-09-01" }, now).ok).toBe(false);
  });

  it("accepts a minimal pull and a full push", () => {
    const pull = validatePull({ vaultId, secret: "ABCD1234" }, now);
    expect(pull.ok).toBe(true);
    if (pull.ok) expect(pull.value.limit).toBe(100);

    const push = validatePush(
      {
        vaultId,
        secret: "ABCD1234",
        accounts: [account()],
        categories: [category()],
        operations: [operation()],
      },
      now,
    );
    expect(push.ok).toBe(true);
  });

  it("rejects malformed push collections and fields", () => {
    const base = { vaultId, secret: "ABCD1234" };
    expect(validatePush({ ...base, accounts: {} }, now)).toMatchObject({
      ok: false,
      message: "accounts doit être un tableau.",
    });
    expect(validatePush({ ...base, operations: [operation({ amountCents: 10.5 })] }, now)).toMatchObject({
      ok: false,
      message: "operations[0].amountCents est invalide.",
    });
    expect(validatePush({ ...base, categories: [category({ kind: "transfer" })] }, now)).toMatchObject({
      ok: false,
      message: "categories[0].kind est invalide.",
    });
    expect(
      validatePush(
        { ...base, accounts: [account({ updatedAt: "1999-01-01T00:00:00.000Z" })] },
        now,
      ),
    ).toMatchObject({
      ok: false,
      message: "accounts[0].updatedAt est invalide.",
    });
    expect(validatePush({ ...base, operations: [operation({ occurredOn: "2026-02-31" })] }, now).ok).toBe(false);
    expect(validatePush({ secret: "ABCD1234", accounts: [account()] }, now)).toMatchObject({
      ok: false,
      message: "Identifiant de coffre invalide.",
    });
    const tooMany = Array.from({ length: 101 }, (_, index) => operation({ id: `op_${index}` }));
    expect(validatePush({ ...base, operations: tooMany }, now)).toMatchObject({
      ok: false,
      message: "Trop d'éléments dans operations (100 maximum).",
    });
  });
});
