import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

// Contract: specs/027-hr-assistant-chatbot/contracts/assistant-api.md.
export const assistantRouter = Router();
assistantRouter.use(authenticate);
const HR = authorize("ADMIN", "HR");
const TAG = "HR Assistant";

const askLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const AskSchema = z.object({ question: z.string().trim().min(3).max(1000) });
const ArticleFields = {
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(10000),
  keywords: z.array(z.string().trim().min(2).max(60)).min(1).max(30),
  policyId: z.string().nullable().optional(),
};
const ArticleSchema = z.object(ArticleFields);
const ArticleUpdateSchema = z.object(ArticleFields).partial().refine((v) => Object.keys(v).length > 0, "Nothing to update.");
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const OverviewQuery = z.object({ from: Day.optional(), to: Day.optional() });
const actorOf = (req: Request) => req.user as AccessTokenPayload;
const id = (req: Request) => req.params.id ?? "";

assistantRouter.post("/ask", askLimiter, validate(AskSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.ask(orgOf(req), req.body.question, actorOf(req)));
}));
assistantRouter.get("/knowledge", handle(async (req: Request, res: Response) => {
  res.json(await service.listArticles(orgOf(req)));
}));
assistantRouter.get("/knowledge/:id", handle(async (req: Request, res: Response) => {
  res.json(await service.getArticle(orgOf(req), id(req)));
}));
assistantRouter.post("/knowledge", HR, validate(ArticleSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.createArticle(orgOf(req), req.body, actorOf(req)));
}));
assistantRouter.patch("/knowledge/:id", HR, validate(ArticleUpdateSchema), handle(async (req: Request, res: Response) => {
  res.json(await service.updateArticle(orgOf(req), id(req), req.body, actorOf(req)));
}));
assistantRouter.delete("/knowledge/:id", HR, handle(async (req: Request, res: Response) => {
  res.json(await service.deleteArticle(orgOf(req), id(req)));
}));
assistantRouter.get("/overview", HR, handle(async (req: Request, res: Response) => {
  res.json(await service.overview(orgOf(req), OverviewQuery.parse(req.query)));
}));

const idp = z.object({ id: z.string() });
documentRoute({ method: "post", path: "/assistant/ask", tag: TAG, status: 200, description: "Ask a question. Each part is answered from your own records or published HR content with sources, or declined (OUT_OF_SCOPE / NO_GROUNDING / NO_RECORDS).", body: AskSchema });
documentRoute({ method: "get", path: "/assistant/knowledge", tag: TAG, description: "HR knowledge articles the assistant answers policy questions from." });
documentRoute({ method: "get", path: "/assistant/knowledge/{id}", tag: TAG, description: "One knowledge article (an answer's source).", params: idp });
documentRoute({ method: "post", path: "/assistant/knowledge", tag: TAG, description: "Write a knowledge article, optionally linked to a published policy. Admin/HR.", body: ArticleSchema });
documentRoute({ method: "patch", path: "/assistant/knowledge/{id}", tag: TAG, description: "Update an article; the next question uses it. Admin/HR.", params: idp, body: ArticleUpdateSchema });
documentRoute({ method: "delete", path: "/assistant/knowledge/{id}", tag: TAG, description: "Delete an article. Admin/HR.", params: idp });
documentRoute({ method: "get", path: "/assistant/overview", tag: TAG, description: "Anonymized question topics and unanswered rate for a period (default: last 30 days). Admin/HR.", query: OverviewQuery });
