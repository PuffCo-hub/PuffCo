# PuffCo production launch handoff

This repository contains the PuffCo web app.

## Current preview

Working preview:

https://www.perplexity.ai/computer/a/puffco-hPPKQ_BpQLajI.Hqry.eCw

Admin route:

Open the app link and add:

/#/admin

Current admin PIN:

PuffCo2026

Change this before real launch.

## What is included

- Customer mobile menu
- Product images
- Product detail popup
- Cart flow
- Cash App payment handoff
- Admin dashboard
- Product management
- Inventory tracking
- Low-stock and out-of-stock behavior
- Order handling
- Substitution system
- Pricing settings
- Vendor and location structure
- Audit logs

## Recommended launch path

1. Buy a domain from a provider like Namecheap, GoDaddy, or Squarespace Domains.
2. Create a hosting account with Render or Railway.
3. Connect this GitHub repository to the host.
4. Set private environment variables.
5. Deploy the app.
6. Connect the domain to the host using DNS records.
7. Add real products in the admin page.
8. Test the full flow from a phone.
9. Create a QR code that points to the final live domain.

## Environment settings

Required:

- `PUFFCO_ADMIN_PIN`: change this from `PuffCo2026` to a private PIN.
- `PUFFCO_DB_PATH`: database file path, usually `data/puffco.db`.

Optional for SMS (Twilio):

- `TWILIO_ACCOUNT_SID`: your Twilio account SID. Find it on the Twilio console home page.
- `TWILIO_AUTH_TOKEN`: your Twilio auth token. Treat this like a password. Never paste it into the app or commit it to GitHub.
- `TWILIO_FROM_PHONE`: the Twilio phone number that will send the texts. Use full E.164 format like `+15551234567`.
- `DRIVER_ALERT_PHONES`: comma-separated list of driver/operator phone numbers in E.164 format that should receive a text every time a new order is placed. Example: `+15555550111,+15555550222`. If this is left blank, the app falls back to the operator phone saved in admin settings.
- `AVERAGE_WAIT_MINUTES`: optional whole number used in the customer confirmation text. Defaults to `45` if not set.
- `PUFFCO_PUSH_WEBHOOK`: optional generic webhook (Slack/Discord) that gets a JSON payload for each new order.

### Setting up SMS on Render (plain English)

1. Open your Render dashboard and click your PuffGo service.
2. Click the **Environment** tab on the left.
3. Click **Add Environment Variable** and add each of the four Twilio-related variables one by one:
   - Key: `TWILIO_ACCOUNT_SID`, Value: paste from your Twilio console.
   - Key: `TWILIO_AUTH_TOKEN`, Value: paste from your Twilio console.
   - Key: `TWILIO_FROM_PHONE`, Value: your Twilio number, e.g. `+15551234567`.
   - Key: `DRIVER_ALERT_PHONES`, Value: comma-separated driver numbers, e.g. `+15555550111,+15555550222`.
4. Optionally also add `AVERAGE_WAIT_MINUTES` (number only, no units).
5. Click **Save Changes**. Render will redeploy automatically.
6. Place a test order to confirm the drivers receive a text and the customer gets a confirmation text.

If any of the Twilio variables are missing, the app keeps working normally — it simply skips sending real text messages and records that the SMS step was skipped in the audit log. No SMS secrets are ever stored in the database or in the admin UI.

## Local development

Install Node.js, then run:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

The app expects the backend to run on port 5000 in the current deployment setup.

## Pre-launch testing

Before taking real orders, test:

- Age gate opens first.
- Product photos show.
- Product detail popup opens.
- Add-to-cart notice appears.
- Cart total looks correct.
- Cash App handoff works.
- Admin sees the order.
- Stock count drops after order.
- Out-of-stock item becomes unavailable.
- Canceling an order restores stock.
- Substitutes show when an item is unavailable.

## Business setup reminder

Before taking real customer orders, confirm permits, local delivery rules, age verification, ID-at-delivery process, refund policy, privacy policy, terms of use, payment-platform rules, and insurance needs.
