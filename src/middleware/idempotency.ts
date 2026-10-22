import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

// 019 FR-005/SC-003: a client that retries a mutation after a dropped connection sends the same
// Idempotency-Key header; the first response is stored and replayed for every retry, so the
// action runs once. Keys are scoped to the caller's credential, method and path, so one caller's
// key can never replay another's response. Records expire after 24 h (scheduler job).
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function scopeHash(req: Request, key: string): string {
  const credential = req.headers.authorization ?? (req.cookies?.refreshToken as string | undefined) ?? "anonymous";
  return createHash("sha256").update(`${credential}\n${req.method}\n${req.baseUrl}${req.path}\n${key}`).digest("hex");
}

export async function idempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.header("Idempotency-Key");
  if (!key || !MUTATING.has(req.method)) return next();
  if (key.length > 200) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Idempotency-Key must be at most 200 characters." } });
    return;
  }
  const hash = scopeHash(req, key);

  try {
    await prisma.idempotencyRecord.create({ data: { scopeHash: hash } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return next(err);
    const existing = await prisma.idempotencyRecord.findUnique({ where: { scopeHash: hash } });
    if (existing?.completedAt && existing.status) {
      res.setHeader("Idempotent-Replayed", "true");
      res.status(existing.status).json(existing.body);
      return;
    }
    res.status(409).json({ error: { code: "IDEMPOTENCY_IN_PROGRESS", message: "This request is already being processed. Retry shortly." } });
    return;
  }

  // Capture the JSON body; persist it once the response finishes. Server errors aren't stored,
  // so the client can retry them for real.
  let body: unknown = null;
  const json = res.json.bind(res);
  res.json = (payload: unknown) => {
    body = payload;
    return json(payload);
  };
  res.on("finish", () => {
    const done =
      res.statusCode >= 500
        ? prisma.idempotencyRecord.delete({ where: { scopeHash: hash } })
        : prisma.idempotencyRecord.update({
            where: { scopeHash: hash },
            data: { status: res.statusCode, body: (body ?? Prisma.JsonNull) as Prisma.InputJsonValue, completedAt: new Date() },
          });
    done.catch((e: unknown) => logger.warn({ err: e }, "idempotency record update failed"));
  });
  next();
}

export async function purgeExpiredIdempotencyRecords(now = Date.now()) {
  const { count } = await prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(now - IDEMPOTENCY_TTL_MS) } } });
  return count;
}
