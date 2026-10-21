import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { registry } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./controller.js";
import {
  CreateOrganizationRequestSchema,
  OrganizationSchema,
  PlatformLoginRequestSchema,
  ProvisionedOrganizationSchema,
} from "./schema.js";

// Contract: specs/015-multi-tenant-activation/contracts/platform-api.md.
export const platformRouter = Router();
const TAG = "Platform (super-admin)";

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
platformRouter.post("/auth/login", loginLimiter, validate(PlatformLoginRequestSchema), handle(c.login));

platformRouter.use("/organizations", c.authenticatePlatform);
platformRouter.get("/organizations", handle(c.list));
platformRouter.post("/organizations", validate(CreateOrganizationRequestSchema), handle(c.provision));
platformRouter.get("/organizations/:id", handle(c.get));
platformRouter.post("/organizations/:id/suspend", handle(c.suspend));
platformRouter.post("/organizations/:id/reactivate", handle(c.reactivate));

// Platform tokens are a separate scheme from org users' bearer tokens.
const platformAuth = registry.registerComponent("securitySchemes", "platformAuth", { type: "http", scheme: "bearer", bearerFormat: "JWT" });
const sec = [{ [platformAuth.name]: [] }];
const json = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const id = z.object({ id: z.string() });
registry.registerPath({ method: "post", path: "/platform/auth/login", tags: [TAG], description: "Super-admin sign-in (separate from organization users).", request: { body: json(PlatformLoginRequestSchema) }, responses: { 200: { description: "Platform token.", ...json(z.object({ accessToken: z.string(), superAdmin: z.object({ id: z.string(), email: z.string() }) })) } } });
registry.registerPath({ method: "get", path: "/platform/organizations", tags: [TAG], security: sec, description: "Every organization with status and usage counts.", responses: { 200: { description: "Organizations.", ...json(z.array(OrganizationSchema)) } } });
registry.registerPath({ method: "post", path: "/platform/organizations", tags: [TAG], security: sec, description: "Provision an isolated organization with its first Admin (temporary password returned once).", request: { body: json(CreateOrganizationRequestSchema) }, responses: { 201: { description: "Provisioned.", ...json(ProvisionedOrganizationSchema) } } });
registry.registerPath({ method: "get", path: "/platform/organizations/{id}", tags: [TAG], security: sec, description: "One organization with usage.", request: { params: id }, responses: { 200: { description: "Organization.", ...json(OrganizationSchema) } } });
registry.registerPath({ method: "post", path: "/platform/organizations/{id}/suspend", tags: [TAG], security: sec, description: "Suspend: every user of the org is blocked at once.", request: { params: id }, responses: { 200: { description: "Suspended.", ...json(OrganizationSchema) } } });
registry.registerPath({ method: "post", path: "/platform/organizations/{id}/reactivate", tags: [TAG], security: sec, description: "Reactivate: access restored at once.", request: { params: id }, responses: { 200: { description: "Active.", ...json(OrganizationSchema) } } });
