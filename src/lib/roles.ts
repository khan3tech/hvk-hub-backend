// Local to apps/api — not shared with apps/web (Constitution Principle II:
// Independent Type Safety). The frontend has its own copy of this set for
// its own nav/role-gating needs.
export const ROLES = ["ADMIN", "HR", "MANAGER", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

// The RBAC matrix from specs/001-auth-rbac/spec.md § Assumptions, as role-only gates for
// use with the `authorize()` middleware. This covers *which roles* may reach an action at
// all — "my team"/"my department" scoping depends on reporting-line data and MUST be
// evaluated in the consuming module's service.ts, never here (constitution Principle III;
// research.md R5). Manager/Employee entries below are still subject to that further scoping.
export const PERMISSIONS = {
  EMPLOYEE_RECORD_CREATE_EDIT: ["ADMIN", "HR"],
  EMPLOYEE_RECORD_VIEW: ["ADMIN", "HR", "MANAGER", "EMPLOYEE"],
  ATTENDANCE_CHECK_IN_OUT: ["ADMIN", "HR", "MANAGER", "EMPLOYEE"],
  LEAVE_REQUEST_CREATE: ["ADMIN", "HR", "MANAGER", "EMPLOYEE"],
  LEAVE_REQUEST_APPROVE: ["ADMIN", "HR", "MANAGER"],
  SALARY_STRUCTURE_EDIT: ["ADMIN", "HR"],
  PAYROLL_RUN: ["ADMIN", "HR"],
  PAYSLIP_VIEW: ["ADMIN", "HR", "MANAGER", "EMPLOYEE"],
  JOB_POSTING_CREATE: ["ADMIN", "HR"],
  RECRUITMENT_PIPELINE_MOVE: ["ADMIN", "HR", "MANAGER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;
