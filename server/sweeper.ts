// Order acknowledgement timeout sweeper.
//
// Runs in-process on a recurring interval. The single-process Express server
// already handles HTTP, the database, and notifications, so an interval-driven
// poll is sufficient — no extra worker is required. The sweep is idempotent:
// orders that have already been flagged or moved past the early statuses are
// skipped.

import { storage } from "./storage";
import type { OrderSettings, NotificationSettings } from "@shared/schema";
import { notify } from "./notifications";

let timer: NodeJS.Timeout | null = null;

export function startSweeper() {
  if (timer) return;
  // Run every 30 seconds. Cheap and frequent enough for prototype workloads.
  timer = setInterval(runOnce, 30_000);
  // Don't keep the event loop alive solely for the sweeper.
  timer.unref?.();
  // Also kick off one immediate sweep at boot so a pre-existing flagged
  // backlog gets processed without waiting 30s.
  setTimeout(runOnce, 1_000);
}

export function stopSweeper() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runOnce() {
  try {
    const settings =
      (await storage.getSetting<OrderSettings>("orderRules")) ||
      ({ ackTimeoutMinutes: 5, ackTimeoutAction: "flag" } as OrderSettings);
    if (!settings.ackTimeoutMinutes || settings.ackTimeoutMinutes <= 0) return;
    const ms = settings.ackTimeoutMinutes * 60_000;
    const overdue = await storage.listUnacknowledgedOlderThan(ms);
    if (overdue.length === 0) return;

    const notif =
      (await storage.getSetting<NotificationSettings>("notifications")) ||
      ({ operatorPhone: "", webhookUrl: "", soundEnabled: true } as NotificationSettings);

    for (const order of overdue) {
      if (settings.ackTimeoutAction === "cancel") {
        await storage.updateOrderStatus(order.id, "canceled");
        // Mirror the cancel into payment status so the unpaid total never
        // shows up in revenue ("pending" or otherwise).
        if (order.paymentStatus === "pending_payment") {
          await storage.updateOrderPaymentStatus(order.id, "canceled");
        }
        await storage.appendAudit("order.auto_canceled", String(order.id), {
          reason: "ack_timeout",
          ageMs: Date.now() - order.createdAt,
        });
      } else {
        await storage.flagOrder(order.id, "ack_timeout");
        await storage.appendAudit("order.flagged", String(order.id), {
          reason: "ack_timeout",
          ageMs: Date.now() - order.createdAt,
        });
      }
      // Best-effort notification. Failures are non-fatal — the audit log is
      // the source of truth.
      try {
        await notify(
          {
            title: `Order #${order.id} needs attention`,
            body: `Unacknowledged for ${settings.ackTimeoutMinutes}+ min — auto-${settings.ackTimeoutAction === "cancel" ? "canceled" : "flagged"}.`,
            tag: "order.timeout",
            subjectId: String(order.id),
          },
          notif,
        );
      } catch (err) {
        console.warn("[sweeper] notify failed:", err);
      }
    }
  } catch (err) {
    console.error("[sweeper] error:", err);
  }
}
