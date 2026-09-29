-- CreateTable
CREATE TABLE "Vault" (
    "id" UUID NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretSalt" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "vaultId" UUID NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "openingBalanceCents" INTEGER NOT NULL,
    "archived" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("vaultId","id")
);

-- CreateTable
CREATE TABLE "Category" (
    "vaultId" UUID NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("vaultId","id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "vaultId" UUID NOT NULL,
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "occurredOn" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("vaultId","id")
);

-- CreateIndex
CREATE INDEX "Account_vaultId_updatedAt_id_idx" ON "Account"("vaultId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Category_vaultId_updatedAt_id_idx" ON "Category"("vaultId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Operation_vaultId_updatedAt_id_idx" ON "Operation"("vaultId", "updatedAt", "id");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
