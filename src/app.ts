import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { generateOpenApiDocument } from "./lib/openapi.js";
import { authRouter } from "./modules/auth/routes.js";
import { employeeRouter, departmentRouter, designationRouter } from "./modules/employee/routes.js";
import {
  attendanceRouter,
  leaveRequestRouter,
  leaveBalanceRouter,
  leaveTypeRouter,
  holidayRouter,
} from "./modules/attendance/routes.js";
import { payrollRouter } from "./modules/payroll/routes.js";
import { recruitmentRouter } from "./modules/recruitment/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { onboardingRouter } from "./modules/onboarding/routes.js";
import { documentsRouter, policiesRouter, publicSignaturesRouter } from "./modules/documents/routes.js";
import { onEmployeeCreated, registerEmployeeDecorator } from "./modules/employee/service.js";
import * as onboarding from "./modules/onboarding/service.js";
import { exitRouter } from "./modules/exit/routes.js";
import * as exit from "./modules/exit/service.js";
import { registerJob } from "./lib/scheduler.js";
import { statutoryRouter } from "./modules/statutory/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { performanceRouter } from "./modules/performance/routes.js";
import { identityAuthRouter, identityRouter } from "./modules/identity/routes.js";
import { loginPolicy } from "./modules/identity/service.js";
import { setLoginPolicy } from "./modules/auth/service.js";
import { calculateStatutory } from "./modules/statutory/service.js";
import { setStatutoryCalculator } from "./modules/payroll/service.js";

// Cross-module extension points (Principle I): modules that build on Employee register here
// rather than the employee module importing them.
onEmployeeCreated(onboarding.onEmployeeCreated); // 007 FR-001
registerEmployeeDecorator("onboarding", onboarding.statusesFor); // 007 FR-007
registerEmployeeDecorator("exit", exit.exitStatusFor); // 009 FR-004
setStatutoryCalculator(calculateStatutory); // 010 FR-004
setLoginPolicy(loginPolicy); // 013 SSO enforcement + MFA
registerJob("exit-due-prompts", 60 * 60 * 1000, async () => {
  await exit.promptExitsDue(); // 009 US2.3
});

// Constitution: Development Workflow "API documentation" — each module's routes.ts registers
// its endpoints on the shared OpenAPI registry (lib/openapi.ts) as part of implementing them,
// tagged with that module's name (e.g. tags: ["Attendance & Leave"]) so the single /docs page
// groups them into a heading per module instead of one flat list.

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/auth", identityAuthRouter); // 013: MFA step + SSO round-trip
  app.use("/api/employees", employeeRouter);
  app.use("/api/departments", departmentRouter);
  app.use("/api/designations", designationRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/leave-requests", leaveRequestRouter);
  app.use("/api/leave-balances", leaveBalanceRouter);
  app.use("/api/leave-types", leaveTypeRouter);
  app.use("/api/holidays", holidayRouter);
  app.use("/api/payroll", payrollRouter);
  app.use("/api/recruitment", recruitmentRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/onboarding", onboardingRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/policies", policiesRouter);
  app.use("/api/public/signatures", publicSignaturesRouter);
  app.use("/api/exit", exitRouter);
  app.use("/api/statutory", statutoryRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/performance", performanceRouter);
  app.use("/api/identity", identityRouter);

  if (process.env.NODE_ENV !== "production") {
    const openApiDocument = generateOpenApiDocument();
    app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use(errorHandler);

  return app;
}
