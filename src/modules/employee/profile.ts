// Self-service profile: personal details and profile picture. Employees edit their own personal
// details (never their email or job details, which stay HR-only); HR/Admin can read them.
import type { Readable } from "node:stream";
import { z } from "zod";
import { DomainError } from "../../middleware/errorHandler.js";
import { getStorage } from "../../lib/storage.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";
import * as repo from "./repository.js";

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{6,18}$/, "Enter a valid phone number.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const GENDERS = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "PREFER_NOT_TO_SAY"] as const;

// .strict(): any other key (email, departmentId, managerId, role, …) is rejected outright.
export const UpdateMyProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120).optional(),
    phone,
    personalEmail: z.string().trim().email("Enter a valid email.").nullable().optional().or(z.literal("").transform(() => null)),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    gender: z.enum(GENDERS).nullable().optional(),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
    maritalStatus: z.enum(MARITAL_STATUSES).nullable().optional(),
    currentAddress: optionalText(500),
    permanentAddress: optionalText(500),
    emergencyContactName: optionalText(120),
    emergencyContactRelation: optionalText(60),
    emergencyContactPhone: phone,
  })
  .strict();
export type UpdateMyProfile = z.infer<typeof UpdateMyProfileSchema>;

const PERSONAL_FIELDS = [
  "phone",
  "personalEmail",
  "dateOfBirth",
  "gender",
  "bloodGroup",
  "maritalStatus",
  "currentAddress",
  "permanentAddress",
  "emergencyContactName",
  "emergencyContactRelation",
  "emergencyContactPhone",
] as const;

function requireSelf(actor: AccessTokenPayload) {
  if (!actor.employeeId) throw new DomainError("NO_EMPLOYEE_RECORD", "Your account isn't linked to an employee record.", 403);
  return actor.employeeId;
}

function present(employee: { id: string; name: string; email: string; photoUpdatedAt: Date | null }, d: Record<string, unknown> | null) {
  const out: Record<string, unknown> = {
    employeeId: employee.id,
    name: employee.name,
    email: employee.email,
    photoUpdatedAt: employee.photoUpdatedAt?.toISOString() ?? null,
    updatedAt: (d?.updatedAt as Date | undefined)?.toISOString() ?? null,
  };
  for (const f of PERSONAL_FIELDS) {
    const v = d?.[f] ?? null;
    out[f] = f === "dateOfBirth" && v ? (v as Date).toISOString().slice(0, 10) : v;
  }
  return out;
}

// Self, or HR/Admin. (Managers see job details elsewhere, not personal ones.)
export async function getPersonalDetails(orgId: string, employeeId: string, actor: AccessTokenPayload) {
  const isHr = actor.role === "HR" || actor.role === "ADMIN";
  if (!isHr && actor.employeeId !== employeeId) throw new DomainError("FORBIDDEN", "You can't view this person's personal details.", 403);
  const employee = await repo.findEmployeeById(orgId, employeeId);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const details = await repo.findPersonalDetails(employeeId);
  return present(employee, details as Record<string, unknown> | null);
}

export async function updateMyProfile(orgId: string, actor: AccessTokenPayload, input: UpdateMyProfile) {
  const employeeId = requireSelf(actor);
  const employee = await repo.findEmployeeById(orgId, employeeId);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);

  if (input.dateOfBirth) {
    const dob = new Date(`${input.dateOfBirth}T00:00:00Z`);
    const age = (Date.now() - dob.getTime()) / (365.25 * 86_400_000);
    if (Number.isNaN(dob.getTime()) || age < 14 || age > 100) {
      throw new DomainError("VALIDATION_ERROR", "Enter a valid date of birth.", 400, { dateOfBirth: ["Enter a valid date of birth."] });
    }
  }

  const data: Record<string, unknown> = {};
  for (const f of PERSONAL_FIELDS) {
    if (input[f] !== undefined) data[f] = f === "dateOfBirth" && input[f] ? new Date(`${input[f]}T00:00:00Z`) : input[f];
  }
  const before = await repo.findPersonalDetails(employeeId);
  const nameChanged = input.name !== undefined && input.name !== employee.name;
  await repo.saveProfile(orgId, employeeId, nameChanged ? input.name : undefined, data);
  await repo.writeActivityLog({
    orgId,
    actorId: employeeId,
    action: "employee.profile_updated",
    entity: "Employee",
    entityId: employeeId,
    // Which fields changed, not their values (personal data stays out of the audit trail).
    after: { fields: [...(nameChanged ? ["name"] : []), ...Object.keys(data)] },
    before: before ? { existed: true } : { existed: false },
  });
  return getPersonalDetails(orgId, employeeId, actor);
}

export async function setMyPhoto(orgId: string, actor: AccessTokenPayload, file: { buffer: Buffer; mimetype: string }) {
  const employeeId = requireSelf(actor);
  const employee = await repo.findEmployeeById(orgId, employeeId);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  const storage = getStorage();
  const key = await storage.put(file.buffer, { contentType: file.mimetype, prefix: `photos/${orgId}` });
  const updated = await repo.updateEmployee(employeeId, { photoKey: key, photoContentType: file.mimetype, photoUpdatedAt: new Date() });
  if (employee.photoKey) await storage.remove(employee.photoKey).catch(() => undefined);
  return { photoUpdatedAt: updated.photoUpdatedAt?.toISOString() ?? null };
}

export async function removeMyPhoto(orgId: string, actor: AccessTokenPayload) {
  const employeeId = requireSelf(actor);
  const employee = await repo.findEmployeeById(orgId, employeeId);
  if (!employee) throw new DomainError("NOT_FOUND", "Employee not found.", 404);
  await repo.updateEmployee(employeeId, { photoKey: null, photoContentType: null, photoUpdatedAt: null });
  if (employee.photoKey) await getStorage().remove(employee.photoKey).catch(() => undefined);
}

// Any signed-in member of the organization may see a colleague's photo (it's shown on avatars).
export async function openPhoto(orgId: string, employeeId: string): Promise<{ stream: Readable; contentType: string }> {
  const employee = await repo.findEmployeeById(orgId, employeeId);
  if (!employee?.photoKey) throw new DomainError("NOT_FOUND", "No profile picture.", 404);
  try {
    return { stream: await getStorage().open(employee.photoKey), contentType: employee.photoContentType ?? "image/jpeg" };
  } catch {
    throw new DomainError("NOT_FOUND", "No profile picture.", 404);
  }
}
