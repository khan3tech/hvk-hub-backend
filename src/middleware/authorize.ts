import type { NextFunction, Request, Response } from "express";
import type { Role } from "../lib/roles.js";

// Route-level role gate. Scope checks that depend on reporting-line data ("my team", "my
// department") belong in the service layer, not here — see Constitution Principle III.
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign-in required." } });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res
        .status(403)
        .json({ error: { code: "FORBIDDEN", message: "You don't have permission to do that." } });
      return;
    }
    next();
  };
}
