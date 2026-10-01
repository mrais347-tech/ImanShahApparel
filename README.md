# ImanShahApparel

Pelikat-inspired trousers: Black, Maroon and Blue, RM89, Free Size. Opening stock: 3 Black, 7 Maroon, 7 Blue. Shipping: RM10 per order throughout Malaysia.

The existing landing page is paired with a persistent bag, guest bank-transfer checkout, Supabase inventory/orders and an allowlisted admin dashboard. Customers report payment on their order page; an admin verifies the bank transfer before stock is deducted and payment is confirmed. Optional Gmail messages cover order receipt and payment confirmation.

See [BACKEND-SETUP.md](BACKEND-SETUP.md) for configuration and launch checks. Database and email credentials are not included; orders remain closed until configured and tested.

```sh
npm ci
npm test
npm run build
npm run dev
```

Preview at http://localhost:4173. Vercel: Other preset, build `npm run build`, output `public`, API functions in root `api/`.

- `/` — landing page, gallery and bag
- `/checkout.html` — Malaysian delivery details and order summary
- `/order.html` — bank instructions, payment reporting and verified status
- `/admin.html` — orders, manual verification, inventory, email retries and tracking

Launch: October 2, 2026, 8 PM Malaysia time. The countdown does not itself enable ordering.

Only public connection keys belong in `shop-config.js`. Server code, SQL and environment files are excluded from public output. No toyyibPay account is required for new orders.
