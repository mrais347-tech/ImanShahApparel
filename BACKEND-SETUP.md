# Backend and checkout setup

This branch adds a separate checkout, Supabase order/inventory database, admin dashboard, and toyyibPay FPX payment integration. The landing-page layout and imagery are preserved. Ordering starts closed with zero stock; no real payments can run until configured.

## 1. Supabase

Create a Supabase project. In its SQL editor run these files in order **on a fresh database**:

1. `supabase/migrations/202610010001_store.sql`
2. `supabase/migrations/202610010002_payments.sql`

These replace the earlier undeployed WhatsApp draft; they are not upgrade migrations for that draft. Use separate sandbox and production projects to keep test bills and customers away from live orders.

In Supabase Authentication, create your administrator user, copy its user UUID, then run:

```sql
insert into public.shop_admins(user_id) values ('YOUR-ADMIN-USER-UUID');
```

Disable public user signups; customers use guest checkout. Only allowlisted users can read orders, change stock, or use the admin dashboard. Login tokens stay in memory and signing in again is required after expiry/reload.

Set these **public values only** in `shop-config.js`:

- `supabaseUrl`: your project URL.
- `publishableKey`: Supabase publishable key (or legacy anon key).
- `turnstileSiteKey`: Cloudflare Turnstile site key.

Never place the Supabase service-role key or toyyibPay secret in this file, GitHub, screenshots, or browser JavaScript.

## 2. Bot verification

Create a Cloudflare Turnstile widget and allow your checkout domain. Copy the public site key into `shop-config.js`; its secret goes into Vercel environment variables. Both hostname and the `order` action are verified by the API. Order creation is also limited to five attempts per phone number per hour. This reduces automated reservations; it does not guarantee protection against distributed abuse.

## 3. Vercel environment variables

Set the variables listed in `.env.example` using the Vercel project settings, then redeploy:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Same Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key |
| `SHOP_ORIGIN` | Exact HTTPS storefront origin, with no trailing slash |
| `TURNSTILE_SECRET_KEY` | Server-only Turnstile secret |
| `TOYYIBPAY_ENV` | `sandbox` for testing; `live` only for production |
| `TOYYIBPAY_SECRET_KEY` | Secret for the matching toyyibPay environment |
| `TOYYIBPAY_CATEGORY_CODE` | Category belonging to that account/environment |
| `PAYMENTS_ENABLED` | `false` until ready; `true` enables bill creation |

The public configuration and server configuration must point to the same Supabase project. Use the configured origin for testing; other preview domains are rejected. API functions live in `api/`, and `npm run build` creates only public assets in `public/`. In Vercel remove any old project-level override for output directory `.` or an empty build command: use `npm run build` and `public` as specified in `vercel.json`.

## 4. Stock, delivery and launch

Open `/admin.html` and sign in. Enter real stock and activate Black, Maroon, and Blue. Prices start at RM89, Free Size. Stock means physical unsold units, including unpaid reservations. Paid orders deduct stock exactly once; do not deduct it again when shipping.

Set the flat Malaysian delivery charge. This version uses one flat rate for every Malaysian state, including Sabah, Sarawak, and Labuan; agree a rate that covers all destinations before opening. There is no international checkout. The seeded launch is **October 2, 2026, 8 PM Malaysia time**, matching the latest landing page. Changing the admin launch does not update the landing-page countdown automatically; keep those two dates aligned.

Enable orders only after stock, shipping, product measurements/descriptions, support details, and payment tests are final. Enabling the database setting alone does not enable payments; `PAYMENTS_ENABLED=true` is also required.

## 5. Payment testing before the real drop

Register/use the toyyibPay sandbox at https://dev.toyyibpay.com. Sandbox keys and categories differ from live ones. Use its simulated bank flow; do not enter real bank credentials into tests.

1. On a publicly reachable test deployment, add a colour to the bag and complete delivery details and Turnstile.
2. Confirm item price and delivery charge, submit once, and follow the FPX payment link.
3. Complete a sandbox success and return to `/order.html` in the same browser tab. Confirm the order shows paid and inventory drops once.
4. Check cancellation, failure, pending payment, browser refresh/retry, unavailable stock, duplicate callback, incorrect callback signature, and expired reservations.
5. Verify the callback at `/api/payment-callback` is reachable. Localhost cannot receive provider callbacks. The order status page also reconciles pending/expired bills against the provider as a recovery path.
6. Check bill expiration occurs at the intended Malaysia time in the sandbox. The API sends `billExpiryDate` in Malaysia time. Confirm provider account behavior before live use.
7. Use a fresh production database and matching live credentials, then verify one small real payment, callback, order, and bank/provider settlement before opening the drop widely.

Payment status from the redirect URL is never trusted. The callback MD5 signature follows toyyibPay's documented formula. The API independently retrieves successful transactions and matches the stored order reference and amount. Duplicate invoices do not deduct stock again. Payment fees are configured to be borne by the merchant; check the merchant account's actual charges.

## Operations and recovery

- Unpaid reservations last 24 hours. Availability excludes expired holds immediately; order records are marked expired on the next relevant operation. A late payment is flagged `review` and does not consume stock that may already belong to another customer.
- The admin dashboard shows the latest 200 orders. Export older records from Supabase if needed.
- A second successful invoice for the same order sets a payment-review flag. Investigate and refund duplicate payments through the provider; no automatic refunds are implemented.
- `review` orders require manual confirmation of stock or a refund. Do not ship them merely because payment arrived. Record the resolution in the provider/order audit process; a review-resolution screen is not part of this version.
- If bill creation times out after the provider may have accepted it, the order stays `creating`. **Do not automatically generate another bill.** Locate the bill in the merchant dashboard using the external order reference. An operator can attach a confirmed matching bill with `checkout_attach(request_id, bill_code)` in the SQL editor, then retry checkout. Confirm amount/reference first. If no bill exists, cancel that reservation and start a new order. Never reset the claim blindly.
- Customer order access uses an unguessable UUID stored in that tab's session storage. It is not included in a public URL and only returns reference, amount, status, and tracking. Closing the tab may lose access; use the merchant receipt and support verification to assist the customer.
- There are no customer accounts, automatic confirmation emails, courier integration, promotions, automatic refunds, or tax calculation in this initial version. Customers see the on-site order status and the provider's payment receipt.

## Local checks

```sh
npm ci
npm test
npm run build
npm run dev
```

Preview at http://localhost:4173. Without configuration, checkout shows a clear unavailable state and payment stays disabled. PGlite tests execute the actual PostgreSQL migrations and exercise permissions, inventory reservations, idempotency and payment transitions. They do not substitute for a live Supabase/FPX integration test.

Browser regression checks: install Chromium with `npx playwright install chromium`, run the build, then `node tests/browser.mjs`. For an existing Chromium binary set `CHROMIUM_PATH`. The browser test starts its own local server and checks desktop/mobile layout, bag persistence, unavailable states and a payment handoff using explicitly mocked external services.

Provider reference: https://toyyibpay.com/apireference/
