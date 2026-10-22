import webpush from "web-push";
import { logger } from "./logger.js";

// Web Push behind one small interface (019 FR-006). With VAPID keys configured
// (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT) messages go out through the browser
// push services; otherwise the log sender records that a push would have been sent.
export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string | null; // FR-007: where tapping the notification opens
  type: string;
}

// "gone" = the subscription no longer exists (expired/revoked) and should be removed.
export type PushResult = "sent" | "gone" | "failed";

export interface PushSender {
  readonly configured: boolean;
  send(subscription: PushSubscriptionJson, payload: PushPayload): Promise<PushResult>;
}

class LogPushSender implements PushSender {
  readonly configured = false;
  async send(subscription: PushSubscriptionJson, payload: PushPayload): Promise<PushResult> {
    logger.info({ endpointHost: new URL(subscription.endpoint).host, type: payload.type }, "push (log sender, not delivered)");
    return "sent";
  }
}

class WebPushSender implements PushSender {
  readonly configured = true;
  constructor(publicKey: string, privateKey: string, subject: string) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }
  async send(subscription: PushSubscriptionJson, payload: PushPayload): Promise<PushResult> {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 24 * 60 * 60 });
      return "sent";
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      logger.warn({ status }, "web push failed");
      return "failed";
    }
  }
}

let sender: PushSender =
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? new WebPushSender(process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY, process.env.VAPID_SUBJECT ?? "mailto:admin@example.com")
    : new LogPushSender();

export function setPushSender(next: PushSender): void {
  sender = next;
}

export function getPushSender(): PushSender {
  return sender;
}
