import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Must run before any module's schema.ts values are used in a registerPath() call.
extendZodWithOpenApi(z);

// Constitution: Technology Stack "API Documentation" — one OpenAPI spec generated from the
// same zod schemas every module already validates against (Principle II). Each module's
// routes.ts registers its endpoints here via `registry.registerPath(...)`, tagged with that
// module's name so Swagger UI groups them into a heading per module on the single /docs page —
// do not hand-write a second, separate contract.
export const registry = new OpenAPIRegistry();

// Lets Swagger UI show an "Authorize" button: paste the accessToken from a successful
// POST /auth/login response there once, and it's attached to every "Try it out" call after
// — otherwise every protected route 401s in the docs UI even right after logging in, since
// the access token is returned in the JSON body, not a cookie Swagger UI can see.
export const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "TeamLoom API",
      version: "0.1.0",
      description: "See specs/ for the feature spec each endpoint implements.",
    },
    servers: [{ url: "/api" }],
  });
}
