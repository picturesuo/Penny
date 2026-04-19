import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";

type DatabaseFacade = {
  execute: (sql: string) => Promise<unknown>;
  raw: typeof prisma;
};

const PRAGMA_STATEMENTS = [
  "PRAGMA foreign_keys = ON",
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
];

let initializationPromise: Promise<void> | null = null;

async function initializeDatabase() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      for (const statement of PRAGMA_STATEMENTS) {
        await prisma.$executeRawUnsafe(statement);
      }
    })().catch((error) => {
      initializationPromise = null;
      throw new Error(`Failed to initialize database connection: ${describeDatabaseError(error)}`);
    });
  }

  return initializationPromise;
}

export const db: DatabaseFacade = {
  async execute(sql: string) {
    await initializeDatabase();

    try {
      return await prisma.$queryRawUnsafe(sql);
    } catch (error) {
      throw new Error(`Database query failed: ${describeDatabaseError(error)}`);
    }
  },
  raw: prisma,
};

export async function ensureDatabaseReady() {
  await initializeDatabase();
}

export function describeDatabaseError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `Prisma request error ${error.code}: ${error.message}`;
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return error.message;
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown database error";
  }
}
