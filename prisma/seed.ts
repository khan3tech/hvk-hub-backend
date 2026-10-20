import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

// Seeds the single MVP org (Constitution Principle VI: multi-tenancy
// readiness, single seeded org for v0.1) with one User+Employee per role so
// the system is reachable and specs/001-auth-rbac/quickstart.md's scenarios
// are runnable end-to-end. Extend as each module lands.
const prisma = new PrismaClient();

// Matches apps/api's controller.ts fallback (`process.env.DEFAULT_ORG_ID ?? "default"`) so
// seeded users are actually reachable without additional env config.
const ORG_ID = process.env.DEFAULT_ORG_ID ?? "default";
// SEED_PASSWORD overrides the well-known dev password on any shared/public environment.
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  // 015: the seeded org is a real Organization row, and a platform operator exists for
  // provisioning/suspending orgs. Override the operator with SUPER_ADMIN_EMAIL/PASSWORD.
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: "Default organization", slug: ORG_ID },
  });
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? "platform@teamloom.dev").toLowerCase();
  await prisma.superAdmin.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      passwordHash: process.env.SUPER_ADMIN_PASSWORD ? await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 12) : passwordHash,
    },
  });

  const department = await prisma.department.upsert({
    where: { orgId_name: { orgId: ORG_ID, name: "Engineering" } },
    update: {},
    create: { orgId: ORG_ID, name: "Engineering" },
  });

  const designation = await prisma.designation.upsert({
    where: { orgId_title: { orgId: ORG_ID, title: "Software Engineer" } },
    update: {},
    create: { orgId: ORG_ID, title: "Software Engineer" },
  });

  const adminEmployee = await prisma.employee.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "admin@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      employeeCode: "EMP-0001",
      name: "Ada Admin",
      email: "admin@teamloom.dev",
      departmentId: department.id,
      designationId: designation.id,
      dateOfJoining: new Date("2024-01-01"),
    },
  });
  await prisma.user.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "admin@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      email: "admin@teamloom.dev",
      passwordHash,
      role: "ADMIN",
      employeeId: adminEmployee.id,
    },
  });

  const hrEmployee = await prisma.employee.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "hr@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      employeeCode: "EMP-0002",
      name: "Helen HR",
      email: "hr@teamloom.dev",
      departmentId: department.id,
      designationId: designation.id,
      dateOfJoining: new Date("2024-01-01"),
    },
  });
  await prisma.user.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "hr@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      email: "hr@teamloom.dev",
      passwordHash,
      role: "HR",
      employeeId: hrEmployee.id,
    },
  });

  const managerEmployee = await prisma.employee.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "manager@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      employeeCode: "EMP-0003",
      name: "Mark Manager",
      email: "manager@teamloom.dev",
      departmentId: department.id,
      designationId: designation.id,
      dateOfJoining: new Date("2024-01-01"),
    },
  });
  await prisma.user.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "manager@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      email: "manager@teamloom.dev",
      passwordHash,
      role: "MANAGER",
      employeeId: managerEmployee.id,
    },
  });

  // Reports to the seeded Manager above, so RBAC scope checks (FR-006, quickstart.md
  // Scenario 3) have a real reporting-line pair to test against.
  const employeeEmployee = await prisma.employee.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "employee@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      employeeCode: "EMP-0004",
      name: "Erin Employee",
      email: "employee@teamloom.dev",
      departmentId: department.id,
      designationId: designation.id,
      managerId: managerEmployee.id,
      dateOfJoining: new Date("2024-01-01"),
    },
  });
  await prisma.user.upsert({
    where: { orgId_email: { orgId: ORG_ID, email: "employee@teamloom.dev" } },
    update: {},
    create: {
      orgId: ORG_ID,
      email: "employee@teamloom.dev",
      passwordHash,
      role: "EMPLOYEE",
      employeeId: employeeEmployee.id,
    },
  });

  // 003-attendance-leave: a default leave type so quickstart.md's scenarios are runnable
  // without a separate HR setup step.
  await prisma.leaveType.upsert({
    where: { orgId_name: { orgId: ORG_ID, name: "Paid" } },
    update: {},
    create: { orgId: ORG_ID, name: "Paid", isPaid: true, defaultDays: 20 },
  });

  // 004-payroll: an unpaid leave type so quickstart.md's unpaid-leave-deduction scenario is
  // runnable without a separate HR setup step.
  await prisma.leaveType.upsert({
    where: { orgId_name: { orgId: ORG_ID, name: "Unpaid" } },
    update: {},
    create: { orgId: ORG_ID, name: "Unpaid", isPaid: false, defaultDays: 30 },
  });

  // 026: the org's currency (INR) for payslips and reporting. No defaultCountry, so the seeded
  // org stays single-country: no payroll country assignments needed (026 FR-011).
  await prisma.payrollCurrencySettings.upsert({
    where: { orgId: ORG_ID },
    update: {},
    create: { orgId: ORG_ID, defaultCurrency: "INR", reportingCurrency: "INR" },
  });

  console.log(
    `Seeded org "${ORG_ID}" with 4 users (password: ${process.env.SEED_PASSWORD ? "from SEED_PASSWORD" : SEED_PASSWORD}):`,
  );
  console.log("  admin@teamloom.dev    (ADMIN)");
  console.log("  hr@teamloom.dev       (HR)");
  console.log("  manager@teamloom.dev  (MANAGER)");
  console.log("  employee@teamloom.dev (EMPLOYEE, reports to manager@teamloom.dev)");
  console.log(`Platform operator: ${superAdminEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
