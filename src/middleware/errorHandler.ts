import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

// Single central error-handling middleware — controllers must not write
// their own try/catch for domain errors (Constitution: Development Workflow).
// Every error response has the shape { error: { code, message, fields? } }.
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof DomainError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, fields: err.fields },
    });
    return;
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  });
}
