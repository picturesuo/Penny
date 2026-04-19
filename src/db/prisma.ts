import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { checkRequiredEnvVars } from "@/lib/env-check";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

checkRequiredEnvVars();

const busyTimeoutMs = Number(process.env.SQLITE_BUSY_TIMEOUT_MS ?? 10000);

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
  timeout: Number.isFinite(busyTimeoutMs) && busyTimeoutMs > 0 ? busyTimeoutMs : 10000,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
