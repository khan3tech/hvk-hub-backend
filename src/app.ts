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
import { onEmployeeCreated, onEmployeeOffboarded, registerEmployeeDecorator } from "./modules/employee/service.js";
import * as onboarding from "./modules/onboarding/service.js";
import { exitRouter } from "./modules/exit/routes.js";
import * as exit from "./modules/exit/service.js";
import { closeStaleSessions } from "./modules/attendance/service.js";
import { registerJob } from "./lib/scheduler.js";
import { statutoryRouter } from "./modules/statutory/routes.js";
import { analyticsRouter } from "./modules/analytics/routes.js";
import { performanceRouter } from "./modules/performance/routes.js";
import { identityAuthRouter, identityRouter } from "./modules/identity/routes.js";
import { loginPolicy } from "./modules/identity/service.js";
import { setLoginPolicy, setOrganizationDirectory } from "./modules/auth/service.js";
import { platformRouter } from "./modules/organizations/routes.js";
import { orgChartRouter } from "./modules/orgchart/routes.js";
import { setCriticalPositionsProvider } from "./modules/orgchart/service.js";
import { helpdeskRouter } from "./modules/helpdesk/routes.js";
import { timeRouter } from "./modules/timetracking/routes.js";
import { activityRouter } from "./modules/activity/routes.js";
import { purgeExpired as purgeActivity } from "./modules/activity/service.js";
import { purgeOldConversations } from "./modules/assistant/ai/chat.js";
import { surveysRouter } from "./modules/surveys/routes.js";
import { idempotency, purgeExpiredIdempotencyRecords } from "./middleware/idempotency.js";
import { devicesRouter } from "./modules/devices/routes.js";
import { careersRouter } from "./modules/careers/routes.js";
import { referralsRouter } from "./modules/referrals/routes.js";
import { bgvRouter } from "./modules/bgv/routes.js";
import { learningRouter } from "./modules/learning/routes.js";
import { successionRouter } from "./modules/succession/routes.js";
import { brandingRouter, publicBrandingRouter } from "./modules/branding/routes.js";
import { assistantRouter } from "./modules/assistant/routes.js";
import * as branding from "./modules/branding/service.js";
import * as succession from "./modules/succession/service.js";
import * as learning from "./modules/learning/service.js";
import * as bgv from "./modules/bgv/service.js";
import { setApplicationDecorator, setHireGate } from "./modules/recruitment/service.js";
import * as referrals from "./modules/referrals/service.js";
import { onApplicationStageChanged } from "./modules/recruitment/service.js";
import { setOneOffEarningsProvider } from "./modules/payroll/service.js";
import { onCandidateDeleted } from "./modules/recruitment/service.js";
import { deleteCandidateDocuments } from "./modules/documents/service.js";
import { dispatchPush } from "./modules/devices/service.js";
import { setPushDispatcher } from "./modules/notifications/service.js";
import { onOrganizationDeleted, organizationDirectory } from "./modules/organizations/service.js";
import { assetsRouter } from "./modules/assets/routes.js";
import * as assets from "./modules/assets/service.js";
import { expensesRouter } from "./modules/expenses/routes.js";
import { calculateStatutory, statutoryCoverage } from "./modules/statutory/service.js";
import { setPayslipBrandingProvider, setStatutoryCalculator, setStatutoryCoverage } from "./modules/payroll/service.js";
import { payrollGlobalRouter } from "./modules/payroll/globalRoutes.js";

// Cross-module extension points (Principle I): modules that build on Employee register here
// rather than the employee module importing them.
onEmployeeCreated(onboarding.onEmployeeCreated); // 007 FR-001
onEmployeeCreated(learning.onEmployeeCreated); // 023 FR-007
registerEmployeeDecorator("onboarding", onboarding.statusesFor); // 007 FR-007
registerEmployeeDecorator("exit", exit.exitStatusFor); // 009 FR-004
registerEmployeeDecorator("assets", assets.assetsDecorator); // 014 FR-004
registerEmployeeDecorator("succession", succession.employeeDecoration); // 024 US1.1 (HR/Admin only)
onEmployeeOffboarded(succession.onEmployeeOffboarded); // 024 FR-005
setCriticalPositionsProvider(succession.criticalPositions); // 024: org chart overlay
setPayslipBrandingProvider(branding.brandingAssets); // 025 FR-006
onOrganizationDeleted(branding.clearBranding); // 025 FR-010
exit.registerExitTaskGuard("ASSET_RETURN", assets.assetReturnGuard); // 014 US2.3
setStatutoryCalculator(calculateStatutory); // 010 FR-004
setStatutoryCoverage(statutoryCoverage); // 026 FR-006
setLoginPolicy(loginPolicy); // 013 SSO enforcement + MFA
setOrganizationDirectory(organizationDirectory); // 015 org slugs + suspension
setPushDispatcher(dispatchPush); // 019 FR-006
onCandidateDeleted((orgId, candidateId) => deleteCandidateDocuments(orgId, candidateId)); // 020 FR-010
onCandidateDeleted((_orgId, _candidateId, applicationIds) => referrals.deleteForApplications(applicationIds)); // 020/021
onApplicationStageChanged((orgId, applicationId, from, to) => referrals.onStageChanged(orgId, applicationId, from, to)); // 021 FR-005/007
setOneOffEarningsProvider(referrals.referralEarnings); // 021 FR-008
setHireGate(bgv.hireGate); // 022 FR-005/006
setApplicationDecorator(bgv.applicationDecoration); // 022 US1.3
onCandidateDeleted((_orgId, _candidateId, applicationIds) => bgv.deleteForApplications(applicationIds)); // 020/022
registerJob("referral-qualifying", 60 * 60 * 1000, async () => {
  await referrals.evaluateQualifying(); // 021 FR-005/006
});
registerJob("idempotency-purge", 60 * 60 * 1000, async () => {
  await purgeExpiredIdempotencyRecords(); // 019 FR-005
});
registerJob("exit-due-prompts", 60 * 60 * 1000, async () => {
  await exit.promptExitsDue(); // 009 US2.3
});
registerJob("activity-retention", 60 * 60 * 1000, async () => {
  await purgeActivity(); // 029 FR-011: 90-day retention
});
registerJob("assistant-conversation-retention", 60 * 60 * 1000, async () => {
  await purgeOldConversations(); // 030 FR-006: 90-day retention
});
registerJob("attendance-end-of-day", 5 * 60 * 1000, async () => {
  await closeStaleSessions(); // a session left open closes at 23:59:59 India time of its day
});

// Constitution: Development Workflow "API documentation" — each module's routes.ts registers
// its endpoints on the shared OpenAPI registry (lib/openapi.ts) as part of implementing them,
// tagged with that module's name (e.g. tags: ["Attendance & Leave"]) so the single /docs page
// groups them into a heading per module instead of one flat list.

export function createApp() {
  const app = express();
  // Behind a reverse proxy (Caddy on EC2) set TRUST_PROXY to the hop count so req.ip — and
  // the login rate limiter keyed on it — sees the real client address, not the proxy's.
  if (process.env.TRUST_PROXY) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY));
  }

  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(idempotency); // 019 FR-005: safe retries via Idempotency-Key
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
  app.use("/api/payroll", payrollGlobalRouter); // 026
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
  app.use("/api/assets", assetsRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/platform", platformRouter); // 015 super-admin tier
  app.use("/api/org-chart", orgChartRouter);
  app.use("/api/helpdesk", helpdeskRouter);
  app.use("/api/time", timeRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/surveys", surveysRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/api/public/careers", careersRouter); // 020: no authentication
  app.use("/api/referrals", referralsRouter);
  app.use("/api/bgv", bgvRouter);
  app.use("/api/learning", learningRouter);
  app.use("/api/succession", successionRouter);
  app.use("/api/branding", brandingRouter);
  app.use("/api/public/branding", publicBrandingRouter); // 025: no authentication
  app.use("/api/assistant", assistantRouter);

  if (process.env.NODE_ENV !== "production") {
    const openApiDocument = generateOpenApiDocument();
    app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use(errorHandler);

  return app;
}
