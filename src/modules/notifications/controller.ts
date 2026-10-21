// Parses the request, calls the service, shapes the response (specs/006-notifications).
import type { Request, Response } from "express";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

function getOrgId(): string {
  return process.env.DEFAULT_ORG_ID ?? "default";
}

function userId(req: Request): string {
  return (req.user as AccessTokenPayload).sub;
}

export async function listMine(req: Request, res: Response): Promise<void> {
  const { unreadOnly, before, limit } = req.query as Record<string, string | undefined>;
  const parsedLimit = limit ? Math.min(Math.max(Number(limit) || 30, 1), 100) : undefined;
  const validBefore = before && !Number.isNaN(Date.parse(before)) ? before : undefined;
  res.json(
    await service.listMyNotifications(getOrgId(), userId(req), {
      unreadOnly: unreadOnly === "true",
      before: validBefore,
      limit: parsedLimit,
    }),
  );
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  res.json(await service.getUnreadCount(getOrgId(), userId(req)));
}

export async function markRead(req: Request, res: Response): Promise<void> {
  res.json(await service.markRead(getOrgId(), userId(req), req.params.id ?? ""));
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  res.json(await service.markAllRead(getOrgId(), userId(req)));
}
