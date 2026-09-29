import { PrismaClient } from "@prisma/client";
import { withServerlessParams } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL manquant");
    }
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: withServerlessParams(connectionString) } },
      log: [],
    });
  }
  return globalForPrisma.prisma;
}
