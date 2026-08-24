import { PrismaClient } from "@prisma/client";

/**
 * Single shared Prisma client.
 *
 * One instance per process, deliberately. Each PrismaClient opens its own
 * connection pool, so constructing them ad hoc exhausts Postgres connections
 * — a failure that only shows up under load, which is the worst time to find
 * it.
 */
export const prisma = new PrismaClient({
  log:
    process.env["NODE_ENV"] === "production"
      ? ["warn", "error"]
      : ["warn", "error"],
});

/** Close the pool so a CLI script exits instead of hanging on an open socket. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
