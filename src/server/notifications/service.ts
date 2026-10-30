import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/** Merchant (store owner) in-app alerts, PRD 9.1. Customer messages live in OutboundMessage, never here. */

type Client = Prisma.TransactionClient | typeof db;

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Inserts one notification, either standalone (`db`) or inside an existing transaction (`tx`). */
export async function createNotification(client: Client, merchantId: string, input: NotificationInput) {
  return client.notification.create({
    data: {
      merchantId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
    select: { id: true },
  });
}

/** Recent notifications for one merchant plus the unread count. Serializable for client components. */
export async function getMerchantNotifications(merchantId: string, limit = 20): Promise<{ items: NotificationItem[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true, type: true, title: true, body: true, entityType: true, entityId: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { merchantId, readAt: null } }),
  ]);
  return {
    unreadCount,
    items: rows.map((r) => ({ ...r, readAt: r.readAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() })),
  };
}

export async function markNotificationRead(merchantId: string, notificationId: string) {
  const r = await db.notification.updateMany({ where: { id: notificationId, merchantId, readAt: null }, data: { readAt: new Date() } });
  return r.count;
}

export async function markAllNotificationsRead(merchantId: string) {
  const r = await db.notification.updateMany({ where: { merchantId, readAt: null }, data: { readAt: new Date() } });
  return r.count;
}
