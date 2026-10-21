import { Router } from "express";
import { z } from "zod";
import { documentRoute } from "../../lib/openapi.js";
import { handle } from "../../lib/handle.js";
import { authenticate } from "../../middleware/authenticate.js";
import * as controller from "./controller.js";
import {
  NotificationListQuerySchema,
  NotificationListResponseSchema,
  UnreadCountResponseSchema,
} from "./schema.js";

// The caller's own notification center (FR-006/FR-007). Every route is self-scoped by the
// signed-in user id, so no role gate is needed beyond authenticate.
export const notificationsRouter = Router();
const TAG = "Notifications";

notificationsRouter.get("/", authenticate, handle(controller.listMine));
notificationsRouter.get("/unread-count", authenticate, handle(controller.unreadCount));
notificationsRouter.post("/read-all", authenticate, handle(controller.markAllRead));
notificationsRouter.post("/:id/read", authenticate, handle(controller.markRead));

documentRoute({ method: "get", path: "/notifications", tag: TAG, description: "The caller's notifications, newest first, plus the unread count.", query: NotificationListQuerySchema, response: NotificationListResponseSchema });
documentRoute({ method: "get", path: "/notifications/unread-count", tag: TAG, description: "Unread badge count for the app shell.", response: UnreadCountResponseSchema });
documentRoute({ method: "post", path: "/notifications/read-all", tag: TAG, status: 200, description: "Mark all of the caller's notifications read.", response: UnreadCountResponseSchema });
documentRoute({ method: "post", path: "/notifications/{id}/read", tag: TAG, status: 200, description: "Mark one of the caller's notifications read (404 for anyone else's).", params: z.object({ id: z.string() }), response: UnreadCountResponseSchema });
