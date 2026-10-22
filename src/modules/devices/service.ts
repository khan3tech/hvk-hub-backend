// Push-notification device registrations (specs/019-mobile-pwa US3). A registration is separate
// from the sign-in session: revoking push permission or removing a device never affects login
// (FR-008), and the in-app notification center (006) is always the primary channel.
import { DomainError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";
import { getPushSender, type PushSubscriptionJson } from "../../lib/push.js";
import * as repo from "./repository.js";
import type { AccessTokenPayload } from "../../lib/jwt.js";

function present(d: Awaited<ReturnType<typeof repo.listForUser>>[number]) {
  // The push subscription itself (endpoint + keys) is a capability — never echoed back.
  return { id: d.id, platform: d.platform, deviceId: d.deviceId, registeredAt: d.registeredAt, lastSeenAt: d.lastSeenAt };
}

export function pushConfig() {
  return { enabled: getPushSender().configured, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null };
}

export async function register(
  orgId: string,
  input: { subscription: PushSubscriptionJson; platform: string; deviceId?: string },
  actor: AccessTokenPayload,
) {
  const d = await repo.upsertDevice({
    orgId,
    userId: actor.sub,
    endpoint: input.subscription.endpoint,
    pushToken: JSON.stringify(input.subscription),
    platform: input.platform,
    deviceId: input.deviceId ?? null,
  });
  return present(d);
}

export async function myDevices(orgId: string, actor: AccessTokenPayload) {
  return (await repo.listForUser(orgId, actor.sub)).map(present);
}

export async function unregister(orgId: string, id: string, actor: AccessTokenPayload) {
  const { count } = await repo.deleteOwned(orgId, actor.sub, id);
  if (count === 0) throw new DomainError("NOT_FOUND", "Device not found.", 404);
}

// Registered with notifications.setPushDispatcher() in app.ts: every in-app notification is also
// pushed to the user's registered devices (FR-006), opening its record (FR-007). Expired
// subscriptions are pruned; failures never affect the in-app notification.
export async function dispatchPush(orgId: string, userId: string, event: { type: string; message: string; link?: string | null }) {
  const devices = await repo.listForUser(orgId, userId);
  for (const d of devices) {
    try {
      const result = await getPushSender().send(JSON.parse(d.pushToken) as PushSubscriptionJson, {
        title: "TeamLoom",
        body: event.message,
        url: event.link ?? null,
        type: event.type,
      });
      if (result === "gone") await repo.deleteById(d.id);
    } catch (err) {
      logger.warn({ err, deviceId: d.id }, "push dispatch failed");
    }
  }
}
