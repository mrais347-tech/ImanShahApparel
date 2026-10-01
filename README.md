# ImanShahApparel

Pelikat-inspired trousers: Black, Maroon and Blue, RM89, Free Size.

The existing landing page is paired with guest checkout, a Supabase inventory/order database, an allowlisted admin dashboard and toyyibPay FPX integration. Payment remains disabled until the merchant account, database, stock and delivery are configured.

See [BACKEND-SETUP.md](BACKEND-SETUP.md) for setup, environment variables, launch checks and recovery procedures.

```sh
npm ci
npm test
npm run build
npm run dev
```

Local preview: http://localhost:4173. Deploy using Vercel's Other preset, build command `npm run build`, output directory `public`. Keep `api/` at the repository root so Vercel creates the server functions.

- `/` — existing landing page, product gallery and persistent bag
- `/checkout.html` — Malaysian delivery details, order summary and FPX handoff
- `/order.html` — verified payment status and shipment tracking
- `/admin.html` — admin login, latest 200 orders, inventory and launch settings

The landing countdown and seeded database launch are October 2, 2026, 8 PM Malaysia time. The countdown does not itself open payments.

Server code, SQL migrations and environment files are excluded from the public build. Only public connection keys belong in `shop-config.js`.
