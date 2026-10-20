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
const SEED_PASSWORD = "Password123!";

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

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

  // Org's default reporting currency (INR for this org). 026-global-multi-currency-payroll's
  // own lookup logic isn't built yet — 004-payroll's service.ts hardcodes the same "INR"
  // default directly rather than reading this row today, but seeding it now means 026 finds
  // the correct value already in place when it starts reading from here instead.
  await prisma.reportingCurrencyConfig.upsert({
    where: { orgId: ORG_ID },
    update: {},
    create: { orgId: ORG_ID, currency: "INR" },
  });

  console.log(`Seeded org "${ORG_ID}" with 4 users (password: ${SEED_PASSWORD}):`);
  console.log("  admin@teamloom.dev    (ADMIN)");
  console.log("  hr@teamloom.dev       (HR)");
  console.log("  manager@teamloom.dev  (MANAGER)");
  console.log("  employee@teamloom.dev (EMPLOYEE, reports to manager@teamloom.dev)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
