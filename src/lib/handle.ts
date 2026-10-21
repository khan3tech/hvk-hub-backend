import type { NextFunction, Request, Response } from "express";

// Wraps an async controller so a thrown DomainError reaches the central errorHandler —
// the same `controller.x(req, res).catch(next)` every routes.ts used to spell out by hand.
export function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}
