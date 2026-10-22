// Prisma queries only — this is the one place in the devices module allowed
// to import the Prisma client (Constitution I: Modular Monolith).
import { prisma } from "../../lib/prisma.js";

// One registration per browser push endpoint; re-registering (e.g. another user signs in on that
// browser) moves it to the new owner.
export function upsertDevice(data: { orgId: string; userId: string; endpoint: string; pushToken: string; platform: string; deviceId: string | null }) {
  return prisma.deviceRegistration.upsert({
    where: { endpoint: data.endpoint },
    create: data,
    update: { orgId: data.orgId, userId: data.userId, pushToken: data.pushToken, platform: data.platform, deviceId: data.deviceId, lastSeenAt: new Date() },
  });
}

export function listForUser(orgId: string, userId: string) {
  return prisma.deviceRegistration.findMany({ where: { orgId, userId }, orderBy: { registeredAt: "desc" } });
}

export function deleteOwned(orgId: string, userId: string, id: string) {
  return prisma.deviceRegistration.deleteMany({ where: { id, orgId, userId } });
}

export function deleteById(id: string) {
  return prisma.deviceRegistration.deleteMany({ where: { id } });
}
