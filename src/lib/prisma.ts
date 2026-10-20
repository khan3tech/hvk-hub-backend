import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the whole API — repositories are the only
// layer allowed to import this (Constitution I: Modular Monolith).
export const prisma = new PrismaClient();
