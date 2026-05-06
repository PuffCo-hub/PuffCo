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

Optional for SMS:

- `PUFFCO_SMS_PROVIDER`: `twilio` or `vonage`.
- `PUFFCO_SMS_FROM`: sender phone number.
- `PUFFCO_TWILIO_ACCOUNT_SID`: Twilio account ID.
- `PUFFCO_TWILIO_AUTH_TOKEN`: Twilio auth token.
- `PUFFCO_PUSH_WEBHOOK`: optional notification webhook.

If SMS is not set up yet, the app can still run. It just will not send real text messages.

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
