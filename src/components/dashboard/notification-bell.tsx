"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bell, CheckCircle2, Clock, Sparkles, XCircle } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeIST } from "@/lib/money";
import { markAllNotificationsAsReadAction, markNotificationAsReadAction } from "@/server/notifications/actions";
import type { NotificationItem } from "@/server/notifications/service";

const TYPE_STYLE = {
  NEW_INSIGHT: { Icon: Sparkles, tone: "bg-indigo-50 text-indigo-600", label: "Insight", variant: "brand" },
  APPROVAL_PENDING: { Icon: Clock, tone: "bg-amber-50 text-amber-600", label: "Approval", variant: "warning" },
  OVERDUE_CREDIT: { Icon: AlertCircle, tone: "bg-rose-50 text-rose-600", label: "Udhaar", variant: "danger" },
  OUTCOME_UPDATE: { Icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600", label: "Outcome", variant: "success" },
  EXECUTION_FAILED: { Icon: XCircle, tone: "bg-rose-50 text-rose-600", label: "Failed", variant: "danger" },
} as const;

function hrefFor(n: NotificationItem): string {
  if (n.entityType === "recommendation") return n.entityId ? `/dashboard/action-centre/${n.entityId}` : "/dashboard/action-centre";
  if (n.entityType === "credit_entry") return "/dashboard/udhaar";
  if (n.entityType === "customer") return "/dashboard/customers";
  return "/dashboard";
}

function relativeTime(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  if (hrs < 48) return "yesterday";
  return formatDateTimeIST(new Date(iso));
}

export function NotificationBell({ items, unreadCount }: { items: NotificationItem[]; unreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [allRead, setAllRead] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Server data refreshed (revalidation): drop optimistic overrides.
  const [seenItems, setSeenItems] = useState(items);
  if (seenItems !== items) {
    setSeenItems(items);
    setReadIds(new Set());
    setAllRead(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isUnread = (n: NotificationItem) => !n.readAt && !allRead && !readIds.has(n.id);
  const unread = allRead ? 0 : Math.max(0, unreadCount - items.filter((n) => !n.readAt && readIds.has(n.id)).length);

  const onItem = (n: NotificationItem) => {
    setOpen(false);
    if (isUnread(n)) {
      setReadIds((s) => new Set(s).add(n.id));
      startTransition(async () => {
        await markNotificationAsReadAction(n.id);
      });
    }
    router.push(hrefFor(n));
  };

  const onMarkAll = () => {
    setAllRead(true);
    startTransition(async () => {
      await markAllNotificationsAsReadAction();
      router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setNow(Date.now());
          setOpen((o) => !o);
        }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[#D0D5DD] bg-white text-[#525866] hover:bg-[#F8F9FA] hover:text-[#171A23] transition-colors cursor-pointer"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#E2E4E9] bg-white shadow-[0_12px_32px_rgba(16,24,40,0.12)]">
          <div className="flex items-center justify-between border-b border-[#E2E4E9] px-4 py-2.5">
            <span className="text-sm font-semibold text-[#171A23]">Notifications</span>
            <button
              type="button"
              onClick={onMarkAll}
              disabled={unread === 0}
              className="text-xs font-medium text-[#4338CA] hover:underline disabled:cursor-default disabled:text-[#94A3B8] disabled:no-underline cursor-pointer"
            >
              Mark all as read
            </button>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-[#737B8C]">No notifications yet.</div>
          ) : (
            <ul className="max-h-[26rem] overflow-y-auto divide-y divide-[#F1F2F4]">
              {items.map((n) => {
                const style = TYPE_STYLE[n.type];
                const fresh = isUnread(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItem(n)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${fresh ? "bg-indigo-50/50 hover:bg-indigo-50" : "opacity-70 hover:bg-[#F8F9FA] hover:opacity-100"}`}
                    >
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.tone}`}>
                        <style.Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`text-xs text-[#171A23] ${fresh ? "font-semibold" : "font-medium"}`}>{n.title}</span>
                          {fresh && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4338CA]" />}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[#525866] line-clamp-2">{n.body}</span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <Badge size="sm" variant={style.variant}>{style.label}</Badge>
                          <time dateTime={n.createdAt} title={formatDateTimeIST(new Date(n.createdAt))} className="text-[10px] text-[#94A3B8]">
                            {relativeTime(n.createdAt, now)}
                          </time>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
