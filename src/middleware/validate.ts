import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

// Validates req.body against one of this module's own zod schemas (see
// each module's schema.ts) before it reaches a controller. Constitution
// Principle II: each app owns and validates against its own contracts.
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body failed validation.",
          fields: result.error.flatten().fieldErrors,
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
