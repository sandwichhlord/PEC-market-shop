import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Generous: a loaded dev machine (parallel test workers + next build) can be slow to hand out connections.
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

/** Single Prisma client per process (reused across dev hot reloads). */
export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** True when the database answers a trivial query. */
export async function isDbReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
