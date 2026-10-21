import type { Request } from "express";
import type { AccessTokenPayload } from "./jwt.js";

// 015-multi-tenant-activation: the organization a request acts in comes from the signed-in
// user's token — never from the client. Every service/repository call takes it as orgId.
export const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID ?? "default";

export function orgOf(req: Request): string {
  return (req.user as AccessTokenPayload | undefined)?.orgId ?? DEFAULT_ORG_ID;
}
