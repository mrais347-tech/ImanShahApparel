# ImanShahApparel

Static storefront preview. No installation or build step is required.

## Deploy

Extract this ZIP and put its contents at the root of your Git repository (index.html should be at the root). Commit and push, then import that repository into Vercel. Use the Other framework preset and the repository root. The included vercel.json serves the root directory without a build step.

If updating an existing project, use the existing repository and preserve its .git directory. Check any existing project build/output overrides before deploying.

## Edit

- index.html: page structure and copy
- style.css: visual styling and responsive layouts
- app.js: products, galleries, demo bag, colour switching and countdown
- assets/: supplied product posters and original product photos

The launch target is 2026-10-07T00:00:00+08:00 (October 7, 2026, midnight Malaysia time), configured as dropAt in app.js. After the countdown ends, it stays at zero and shows a check-back message; it does not automatically enable purchasing.

## Current limitations

Checkout and payments are disabled. Prices are unconfirmed. Sizes are provisional. The demo bag resets on reload. TikTok playback depends on TikTok availability and browser restrictions. Generated campaign posters are used alongside original product photographs.

This archive contains the current v8 storefront exported from source commit b5fda804aaadfff0e644343286cbe980eb2ce45e. It excludes repository history, credentials, and Sites hosting metadata.
