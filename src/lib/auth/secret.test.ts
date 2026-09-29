import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "@/lib/auth/secret";

const pepper = "test-pepper-value";

describe("secret hash", () => {
  it("verifies the secret that was hashed", async () => {
    const stored = await hashSecret("device-secret", pepper);
    expect(stored.secretSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(stored.secretHash).toMatch(/^[0-9a-f]{128}$/);
    await expect(verifySecret("device-secret", stored.secretHash, stored.secretSalt, pepper)).resolves.toBe(true);
  });

  it("rejects a different secret", async () => {
    const stored = await hashSecret("device-secret", pepper);
    await expect(verifySecret("other-secret", stored.secretHash, stored.secretSalt, pepper)).resolves.toBe(false);
  });

  it("rejects the same secret when the pepper differs", async () => {
    const stored = await hashSecret("device-secret", pepper);
    await expect(
      verifySecret("device-secret", stored.secretHash, stored.secretSalt, "another-pepper-value"),
    ).resolves.toBe(false);
  });

  it("uses a fresh salt so two hashes of the same secret differ", async () => {
    const first = await hashSecret("device-secret", pepper);
    const second = await hashSecret("device-secret", pepper);
    expect(first.secretSalt).not.toBe(second.secretSalt);
    expect(first.secretHash).not.toBe(second.secretHash);
    await expect(verifySecret("device-secret", first.secretHash, first.secretSalt, pepper)).resolves.toBe(true);
    await expect(verifySecret("device-secret", second.secretHash, second.secretSalt, pepper)).resolves.toBe(true);
  });

  it("returns false for a tampered hash without throwing", async () => {
    const stored = await hashSecret("device-secret", pepper);
    const tampered = `00${stored.secretHash.slice(2)}`;
    await expect(verifySecret("device-secret", tampered, stored.secretSalt, pepper)).resolves.toBe(false);
    await expect(verifySecret("device-secret", "zz", stored.secretSalt, pepper)).resolves.toBe(false);
  });
});
