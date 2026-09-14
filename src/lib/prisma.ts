import { PrismaClient } from '@prisma/client';

// Standard Next.js dev-hot-reload-safe PrismaClient singleton.
// In development, Next.js clears the Node.js module cache on every request,
// which would otherwise create a new PrismaClient on every reload and quickly
// exhaust database connections. Caching the client on `globalThis` avoids that.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
