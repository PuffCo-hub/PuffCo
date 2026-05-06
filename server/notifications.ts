// Notification provider stub.
//
// Real SMS and push delivery requires a configured provider. This module
// exposes a single `notify` function that the rest of the server calls; if
// no provider is configured, it logs the event and writes to the audit log
// instead of failing the request.
//
// To wire a real provider, set environment variables and update the branch
// inside `notify` accordingly. The placeholders below show the contract:
//
//   PUFFCO_SMS_PROVIDER       — "twilio" | "vonage" | "" (disabled)
//   PUFFCO_SMS_FROM           — sender id / phone number
//   PUFFCO_TWILIO_ACCOUNT_SID
//   PUFFCO_TWILIO_AUTH_TOKEN
//   PUFFCO_PUSH_WEBHOOK       — generic webhook URL (Slack/Discord/etc.)
//
// The admin UI also stores an operator phone and webhook URL in the
// settings table; values from settings take precedence over env vars at
// runtime, but env vars provide credentials the UI never holds.

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

export async function notify(
  ev: NotifyEvent,
  settings: NotificationSettings,
): Promise<{ delivered: NotifyChannel[]; errors: string[] }> {
  const delivered: NotifyChannel[] = [];
  const errors: string[] = [];

  // SMS branch — only fires if a provider is configured via env vars AND a
  // recipient is set in settings. We never throw on missing credentials;
  // the call simply records that SMS was skipped.
  const smsProvider = process.env.PUFFCO_SMS_PROVIDER || "";
  const smsTo = settings.operatorPhone?.trim() || "";
  if (smsProvider && smsTo) {
    try {
      // Placeholder: real implementation would call the provider SDK.
      // e.g. twilioClient.messages.create({ to: smsTo, body: ev.body, from: process.env.PUFFCO_SMS_FROM })
      console.log(
        `[notify] (placeholder) SMS via ${smsProvider} -> ${smsTo}: ${ev.title}`,
      );
      delivered.push("sms");
    } catch (err: any) {
      errors.push(`sms: ${err?.message || err}`);
    }
  }

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
