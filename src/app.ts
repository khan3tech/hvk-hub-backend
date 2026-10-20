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

// TODO: mount remaining module routers as each feature is implemented:
// 005-recruitment-ats.
//
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
  app.use("/api/employees", employeeRouter);
  app.use("/api/departments", departmentRouter);
  app.use("/api/designations", designationRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/leave-requests", leaveRequestRouter);
  app.use("/api/leave-balances", leaveBalanceRouter);
  app.use("/api/leave-types", leaveTypeRouter);
  app.use("/api/holidays", holidayRouter);
  app.use("/api/payroll", payrollRouter);

  if (process.env.NODE_ENV !== "production") {
    const openApiDocument = generateOpenApiDocument();
    app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use(errorHandler);

  return app;
}
