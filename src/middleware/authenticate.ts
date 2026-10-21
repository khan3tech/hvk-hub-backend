import type { NextFunction, Request, Response } from "express";
import moment from "moment";
import { hashToken, verifyToken, type AccessTokenPayload } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { DEFAULT_ORG_ID } from "../lib/tenant.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

// Verifies the Authorization: Bearer <accessToken> header, attaches req.user, and 401s on
// missing/invalid/expired tokens. If no Bearer token is present, falls back to the httpOnly
// refreshToken cookie — needed so a Next.js Server Component (which only has cookies, never
// an in-memory access token) can resolve the current user server-side for RBAC-gated
// rendering (constitution Principle V). The cookie fallback costs one extra DB lookup, which
// is acceptable here since it's off the hot path of every regular API call.
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  let payload: AccessTokenPayload;

  if (bearerToken) {
    try {
      payload = verifyToken<AccessTokenPayload>(bearerToken, process.env.JWT_ACCESS_SECRET ?? "");
    } catch {
      res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "Session expired or invalid. Please sign in again." } });
      return;
    }
  } else {
    const cookieToken = req.cookies?.refreshToken as string | undefined;
    if (!cookieToken) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign-in required." } });
      return;
    }

    const tokenHash = hashToken(cookieToken);
    const stored = await prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: moment().toDate() } },
      include: { user: true },
    });
    if (!stored) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign-in required." } });
      return;
    }
    payload = {
      sub: stored.user.id,
      role: stored.user.role as AccessTokenPayload["role"],
      employeeId: stored.user.employeeId,
      orgId: stored.user.orgId,
    };
  }

  // 015 FR-007/SC-003: a suspended organization is cut off immediately, not when tokens expire.
  const organization = await prisma.organization.findUnique({
    where: { id: payload.orgId ?? DEFAULT_ORG_ID },
    select: { status: true },
  });
  if (organization?.status === "SUSPENDED") {
    res.status(403).json({
      error: { code: "ORGANIZATION_SUSPENDED", message: "Your organization's access is suspended. Contact your administrator." },
    });
    return;
  }

  if (payload.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: payload.employeeId },
      select: { status: true },
    });
    if (employee?.status === "OFFBOARDED") {
      res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "Session expired or invalid. Please sign in again." } });
      return;
    }
  }

  req.user = payload;
  next();
}
