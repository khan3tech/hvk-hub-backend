import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { orgOf } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as service from "./service.js";

// Contract: specs/019-mobile-pwa/contracts/mobile-api.md. Self-service only.
export const devicesRouter = Router();
devicesRouter.use(authenticate);
const TAG = "Mobile / PWA";

const RegisterSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints must be HTTPS."),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  }),
  platform: z.string().trim().min(1).max(40),
  deviceId: z.string().trim().min(8).max(100).optional(),
});

const actorOf = (req: Request) => req.user as AccessTokenPayload;

devicesRouter.get("/push-config", handle(async (_req: Request, res: Response) => {
  res.json(service.pushConfig());
}));
devicesRouter.post("/", validate(RegisterSchema), handle(async (req: Request, res: Response) => {
  res.status(201).json(await service.register(orgOf(req), req.body, actorOf(req)));
}));
devicesRouter.get("/me", handle(async (req: Request, res: Response) => {
  res.json(await service.myDevices(orgOf(req), actorOf(req)));
}));
devicesRouter.delete("/:id", handle(async (req: Request, res: Response) => {
  await service.unregister(orgOf(req), req.params.id ?? "", actorOf(req));
  res.status(204).send();
}));

documentRoute({ method: "get", path: "/devices/push-config", tag: TAG, description: "Whether push is enabled and the VAPID public key for PushManager.subscribe()." });
documentRoute({ method: "post", path: "/devices", tag: TAG, description: "Register this browser's push subscription (re-registering moves it to you).", body: RegisterSchema });
documentRoute({ method: "get", path: "/devices/me", tag: TAG, description: "Your registered devices (subscription keys are never returned)." });
documentRoute({ method: "delete", path: "/devices/{id}", tag: TAG, status: 204, description: "Remove one of your devices; your sign-in sessions are unaffected.", params: z.object({ id: z.string() }) });
