import { Router, type Request, type Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { DomainError } from "../../middleware/errorHandler.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

// Contract: specs/025-white-labeling/contracts/branding-api.md.
export const brandingRouter = Router();
brandingRouter.use(authenticate);
const ADMIN = authorize("ADMIN");
const TAG = "Branding";

const ColorSchema = z.object({ primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB hex color.") });
const actorOf = (req: Request) => req.user as AccessTokenPayload;

// FR-008: the size limit is enforced while streaming, before anything is stored.
const logoParser = multer({ storage: multer.memoryStorage(), limits: { fileSize: service.LOGO_MAX_BYTES, files: 1, fields: 5 } }).single("file");
function parseLogo(req: Request, res: Response, next: (err?: unknown) => void) {
  logoParser(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new DomainError("FILE_TOO_LARGE", `Logos must be ${Math.floor(service.LOGO_MAX_BYTES / 1024)} KB or smaller.`, 413));
    }
    if (err instanceof multer.MulterError) return next(new DomainError("UPLOAD_INVALID", "Upload must be multipart/form-data with one 'file'.", 400));
    next(err);
  });
}

brandingRouter.get("/", handle(async (req: Request, res: Response) => {
  res.json(await service.getBranding(orgOf(req)));
}));
brandingRouter.put("/color", ADMIN, validate(ColorSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.setPrimaryColor(orgOf(req), req.body.primaryColor, actorOf(req)));
}));
brandingRouter.post("/logo", ADMIN, parseLogo, handle(async (req: Request, res: Response) => {
  res.json(await service.setLogo(orgOf(req), req.file, actorOf(req)));
}));
brandingRouter.delete("/logo", ADMIN, handle(async (req: Request, res: Response) => {
  res.json(await service.removeLogo(orgOf(req), actorOf(req)));
}));
brandingRouter.delete("/", ADMIN, handle(async (req: Request, res: Response) => {
  res.json(await service.resetBranding(orgOf(req)));
}));

// Unauthenticated: the sign-in page and careers page of one organization (by slug).
export const publicBrandingRouter = Router();
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });
const slug = (req: Request) => req.params.org ?? "";

publicBrandingRouter.get("/:org", publicLimiter, handle(async (req: Request, res: Response) => {
  res.json(await service.getPublicBranding(slug(req)));
}));
publicBrandingRouter.get("/:org/logo", publicLimiter, handle(async (req: Request, res: Response) => {
  const { stream, contentType } = await service.openPublicLogo(slug(req));
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=300");
  stream.pipe(res);
}));

const orgp = z.object({ org: z.string() });
documentRoute({ method: "get", path: "/branding", tag: TAG, description: "My organization's branding (defaults when unset): name, primaryColor, logoUrl." });
documentRoute({ method: "put", path: "/branding/color", tag: TAG, status: 200, description: "Set the primary color; < 3:1 contrast with white is rejected, < 4.5:1 returns a warning. Admin.", body: ColorSchema });
documentRoute({ method: "post", path: "/branding/logo", tag: TAG, status: 200, description: "Upload the logo (multipart 'file', PNG/JPEG, size-limited). Admin." });
documentRoute({ method: "delete", path: "/branding/logo", tag: TAG, description: "Remove the logo. Admin." });
documentRoute({ method: "delete", path: "/branding", tag: TAG, description: "Reset to the default branding. Admin." });
documentRoute({ method: "get", path: "/public/branding/{org}", tag: TAG, description: "An organization's branding by slug (sign-in and careers pages). No authentication.", params: orgp, auth: false });
documentRoute({ method: "get", path: "/public/branding/{org}/logo", tag: TAG, description: "The organization's logo image. No authentication.", params: orgp, auth: false });
