// Notification delivery.
//
// SMS delivery uses Twilio's REST API directly via Node fetch with HTTP basic
// auth — no SDK dependency. If the required env vars are missing, SMS calls
// are skipped (logged and audited) without breaking the order flow.
//
// Required env vars for SMS:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_PHONE     (E.164, e.g. +15551234567)
//
// Optional:
//   PUFFCO_PUSH_WEBHOOK   generic webhook URL (Slack/Discord/etc.)

import type { NotificationSettings } from "@shared/schema";

export type NotifyChannel = "sms" | "webhook" | "log";

export type NotifyEvent = {
  title: string;
  body: string;
  // Optional event tag so downstream automations can filter
  tag?: string;
  // Subject (order id, product id) for logs
  subjectId?: string | null;
};

export type SmsResult = {
  to: string;
  ok: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
};

function smsConfig() {
  return {
    sid: (process.env.TWILIO_ACCOUNT_SID || "").trim(),
    token: (process.env.TWILIO_AUTH_TOKEN || "").trim(),
    from: (process.env.TWILIO_FROM_PHONE || "").trim(),
  };
}

export function isSmsConfigured() {
  const c = smsConfig();
  return Boolean(c.sid && c.token && c.from);
}

// Send a single SMS via Twilio. Never throws — returns a structured result so
// callers can decide whether to log/audit the outcome.
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const target = (to || "").trim();
  if (!target) {
    return { to: target, ok: false, skipped: true, reason: "missing recipient" };
  }
  const cfg = smsConfig();
  if (!cfg.sid || !cfg.token || !cfg.from) {
    return {
      to: target,
      ok: false,
      skipped: true,
      reason: "twilio env vars missing",
    };
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.sid)}/Messages.json`;
    const auth = Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64");
    const form = new URLSearchParams();
    form.set("To", target);
    form.set("From", cfg.from);
    form.set("Body", body);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { to: target, ok: false, error: `twilio ${res.status}: ${text.slice(0, 200)}` };
    }
    return { to: target, ok: true };
  } catch (err: any) {
    return { to: target, ok: false, error: String(err?.message || err) };
  }
}

// Parse DRIVER_ALERT_PHONES (comma-separated) and fall back to the operator
// phone configured in admin settings. Returns the deduped list of recipients.
export function resolveDriverRecipients(operatorPhone?: string): string[] {
  const raw = process.env.DRIVER_ALERT_PHONES || "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return Array.from(new Set(fromEnv));
  const fallback = (operatorPhone || "").trim();
  return fallback ? [fallback] : [];
}

export async function notify(
  ev: NotifyEvent,
  settings: NotificationSettings,
): Promise<{ delivered: NotifyChannel[]; errors: string[] }> {
  const delivered: NotifyChannel[] = [];
  const errors: string[] = [];

  // Webhook branch — fires for any webhook URL configured in settings.
  const webhook = settings.webhookUrl?.trim() || process.env.PUFFCO_PUSH_WEBHOOK || "";
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ev.title,
          body: ev.body,
          tag: ev.tag ?? null,
          subjectId: ev.subjectId ?? null,
          ts: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        errors.push(`webhook: ${res.status}`);
      } else {
        delivered.push("webhook");
      }
    } catch (err: any) {
      errors.push(`webhook: ${err?.message || err}`);
    }
  }

  // Always emit a structured console line so prototype operators can verify
  // wiring without provider credentials.
  console.log(
    `[notify] ${ev.tag || "event"} :: ${ev.title} :: ${ev.body}` +
      (delivered.length ? ` (delivered: ${delivered.join(",")})` : " (logged only)"),
  );
  if (delivered.length === 0) delivered.push("log");

  return { delivered, errors };
}
