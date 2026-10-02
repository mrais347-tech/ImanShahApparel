# Bank-transfer checkout setup

New orders use manual DuitNow / bank transfer. There is no receipt upload or toyyibPay redirect. The landing-page layout is unchanged.

## Confirmed store details

- Receiving bank details are entered privately in Vercel, never committed to the public repository.
- Contact / email sender: **imanshahapparel@gmail.com**
- Blue: **7**; Maroon: **7**; Black: **3** — 17 opening units
- RM89 per pair, Free Size
- Delivery: **RM10 per order, all Malaysia**, including Sabah, Sarawak and Labuan
- Launch: October 2, 2026, 8 PM Malaysia time

The stock and shipping are seeded by migrations. Orders stay closed until explicitly enabled. One pair totals RM99; two pairs total RM188.

## 1. Create the database and admin

Create a Supabase project. Run the five SQL files in `supabase/migrations/` in filename order using its SQL editor. They create tables, narrow access functions, payment verification, opening inventory, and the email queue.

For an existing project with migrations 001 and 002 already applied, run only 003–005. Migration 004 refuses to reset inventory if orders already exist: do not delete real orders to bypass this. Review physical stock and reservations before applying opening stock to an active store. This migration set is not an upgrade for the old undeployed September WhatsApp draft.

In Supabase Authentication, create the administrator user and copy its UUID, then run:

```sql
insert into public.shop_admins(user_id) values ('YOUR-ADMIN-USER-UUID');
```

Disable public signups; customers use guest checkout. Only allowlisted users can see orders, update inventory or confirm payments. Admin login tokens stay in memory; sign in again after expiry or reload.

In `shop-config.js`, enter the public Supabase project URL, publishable key (or legacy anon key), and Cloudflare Turnstile site key. Never put the service-role key, Gmail app password, or admin password in browser files.

## 2. Vercel and bot verification

Create a Cloudflare Turnstile widget for your checkout domain. Public site key goes in `shop-config.js`, secret in Vercel environment variables. The backend verifies the hostname and `order` action and limits order attempts by hashed phone number.

Configure these server-only Vercel environment variables and redeploy:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL matching `shop-config.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key |
| `SHOP_ORIGIN` | Exact HTTPS storefront origin, no trailing slash |
| `TURNSTILE_SECRET_KEY` | Turnstile secret |
| `BANK_ACCOUNT_NAME` | Exact receiving account name supplied by the merchant |
| `BANK_NAME` | Receiving bank name |
| `BANK_ACCOUNT_NUMBER` | Receiving account number as text, preserving any leading zero |
| `BANK_CHECKOUT_ENABLED` | Start `false`; set `true` after testing |
| `EMAIL_ENABLED` | Start `false`; set `true` once Gmail is connected |
| `GMAIL_APP_PASSWORD` | Dedicated app password for imanshahapparel@gmail.com |

Use Vercel's Other framework preset, `npm run build`, output `public`. Remove older project-level overrides pointing to `.` or no build command. API files remain in root `api/`; the build copies only public assets, never SQL, server code or environment files.

## 3. Connect Gmail confirmation emails

The implementation sends through `smtp.gmail.com` over TLS on port 465 using Nodemailer. The sender and reply-to are fixed to **imanshahapparel@gmail.com**.

The account owner needs to enable Google 2-Step Verification, then create a dedicated App Password if the option is available. Enter it directly into the Vercel `GMAIL_APP_PASSWORD` environment variable, not GitHub or chat. Do not use the normal Gmail login password. Set `EMAIL_ENABLED=true` and redeploy. Some accounts cannot use App Passwords; if that applies, use an OAuth-capable email integration or a verified-domain transactional provider instead.

Google setup: https://support.google.com/mail/answer/185833

This is a small-drop sending option, not a guarantee of delivery. Test sending from the actual Vercel deployment to a real inbox and check spam. Google may block an unfamiliar server connection or enforce sending limits. No actual email has been sent as part of the local automated tests.

Two distinct messages are implemented:

1. **Order received — payment pending:** order items, exact total, bank details, payment deadline and private order link.
2. **Payment confirmed:** sent after an admin verifies the incoming transfer and inventory allocation succeeds.

Email failure never rolls back payment confirmation. The admin dashboard displays queue states and offers **Send / retry order email**. A `sent` state means the SMTP server accepted the message, not that the customer opened or received it. No automatic background retry is configured; failed/queued messages need an admin retry. A sending claim expires after five minutes; at most five attempts are allowed. After an ambiguous SMTP timeout, retry can produce a duplicate email—check Gmail Sent first. Payment and stock remain idempotent.

The email contains an unguessable private order link in the URL fragment. The order page saves it in the tab session and removes it from the URL. Do not forward that link. Customers without the link/session can email support with their order reference for assistance.

## 4. Customer and admin flow

1. Customer adds a colour and submits delivery/contact details.
2. Server checks prices and stock, reserves items for 24 hours and returns the order page. Bank instructions show the server-calculated total, so the customer can check it before transferring.
3. Customer transfers the exact amount with the order reference, then clicks **I've made payment**. This records a notification, not payment proof; it does not extend the reservation or deduct inventory.
4. Admin opens `/admin.html`, filters **Awaiting verification**, and checks the bank account directly.
5. **Verify bank payment** requires the bank's actual transaction reference and amount received. One bank transaction cannot be reused for another order. The admin does not need to wait for the customer to click the report button if the transfer is already matched.
6. A verified order deducts stock once, becomes paid, and attempts the confirmation email. Paid orders can be marked shipped with courier/tracking details.

Stock in admin means physical unsold units including unpaid reservations. Do not deduct stock again during packing or shipping. Pending reservations exclude inventory from availability. Expired holds stop counting immediately; records are marked expired on the next relevant operation.

A late transfer is checked against remaining unreserved stock. If available, confirmation allocates it; otherwise the order goes to **review** without consuming someone else's stock. Review orders need manual refund/fulfilment arrangements; do not ship until resolved. Refund processing and a review-resolution screen are not implemented. If the received amount is wrong or the transfer reference is missing, contact the customer and reconcile before confirming.

## 5. Launch checklist

- Check the account name and number against the merchant's banking app.
- Verify physical stock and RM10 nationwide postage in admin.
- Confirm the landing-page product descriptions/measurements are final.
- Run a test order through a separate test database/deployment, verify the bank details, payment report, admin confirmation, stock deduction and both email types.
- Ensure an ordinary account cannot access admin data.
- Confirm cancellation, expiry, sold-out stock and retry behavior.
- Enable the database order switch and `BANK_CHECKOUT_ENABLED=true` only after testing.
- The database launch time and landing countdown are separate settings; keep both aligned if the date changes.

## Local checks

```sh
npm ci
npm test
npm run build
npm run dev
```

Preview at http://localhost:4173. With no configuration the checkout clearly stays unavailable. SQL tests use the actual migrations in PGlite, including roles and transaction logic; they do not replace testing on live Supabase.

For browser tests: `npx playwright install chromium`, then `npm run build` and `node tests/browser.mjs`. Set `CHROMIUM_PATH` to use an existing browser binary. Tests start their own local server and use explicitly mocked external services. No real transfers or emails are made.

Legacy toyyibPay callback/reconciliation code is retained for existing gateway orders, but new checkout does not create payment bills or require gateway credentials.
