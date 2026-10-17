# Implementation plan: Phase 0 and Phase 1

**Status:** waiting for approval. No application code has been written.

Read §A first. It lists the places where I think the spec is wrong or ambiguous, and what I propose instead. Every change I make to the spec is listed there; nothing below it departs from the spec silently.

---

## A. Spec issues: where I'd push back

**1. Several drop-off points vs. "pickup at the Union desk, always" (§10.3).**
You said finders can drop items at the Union, Chambers or Wall. §10.3 says sensitive items are picked up at the Union, always.
*Proposal:* the drop-off choice appears on the success screen, after posting, so it costs nothing against the 15-second target. Non-sensitive items offer all three points and default to the Union. Sensitive items show only the Union, and the copy explains why. Drop-off points get their own table, and each item stores a `drop_off_point_id` so the owner knows where to go. *Open question for you:* are Chambers and Wall staffed desks, or unattended bins?

**2. Phase 1 can't auto-suggest a category from the photo.**
Suggesting a category from an image needs a vision model. That means a paid external API on the critical path, which works against P1 (an extra round trip on campus wifi), the budget, and §8's rule that nothing may hard-depend on AI.
*Proposal:* Phase 1 ships a large icon grid of categories. The six most-posted categories come first, and one tap picks a category. Auto-suggest moves to Phase 4 as a zero-shot CLIP pass that can only re-order the grid, never block it.

**3. RLS can't hide columns.**
`items.verification_secret`, `posted_by` and `posted_by_contact` sit on a row that students can read, so RLS alone would expose them. Column grants would work, but they break quietly whenever someone adds a column.
*Proposal:* move those three fields into an `item_private` table (1:1 with items) that only staff and the original poster can read. This also guarantees that finder identity never reaches the browse query.

**4. Students need to see sensitive items as placeholders, but must not see their rows.**
§5.2 requires a "wallet found in Chambers" card; §10.3 says no photo and no detail.
*Proposal:* add a `browse_items` view that returns only safe columns. For sensitive rows it returns null description, colours and photos. Students read from the view. RLS on the base `items` table allows staff and the poster only. Photo storage policies also check the item isn't sensitive, so a guessed storage path still returns nothing.

**5. Supabase Auth would accept any email if called directly.**
The anon key is public, so anyone can call `signInWithOtp` with a gmail address and skip our server checks.
*Proposal:* enforce `@davidson.edu` in three places: the Zod schema, the server action, and a Postgres trigger on `auth.users` that rejects every other domain. The trigger is the real guarantee; the other two give friendly error messages. The trigger also lowercases the address and rejects `+tags`, so one person can't create several accounts.

**6. The 10 MB upload cap is moot on Vercel.**
Vercel function bodies are capped at about 4.5 MB, and phone photos are 3–12 MB. Sending the raw file over campus wifi would also break the 15-second target.
*Proposal:* the browser resizes each photo to at most 2048 px JPEG (about 400–900 KB) before upload. The canvas re-encode also drops EXIF in the browser as a side effect. The server still does everything §10.1 requires: magic-byte MIME sniffing, a 4 MB cap, a full decode and re-encode to WebP with sharp, and a test proving the output has no EXIF or GPS. The server is the guarantee and the client step is an optimisation. If the browser can't resize, the user sees a clear error rather than a silent failure.

**7. A strict CSP makes every page dynamic.**
A nonce-based CSP without `unsafe-inline` is the only real CSP Next.js supports, and nonces force dynamic rendering. Public pages are then server-rendered on every request instead of served from cache.
*Proposal:* accept that. Server rendering on Vercel is fast enough to hit LCP < 2.5 s. I'll check it with Lighthouse rather than weaken the CSP.

**8. "Purge as a scheduled job from day one" (§10.4) vs. retention listed under Phase 3.**
*Proposal:* build the purge in Phase 1 as a daily Vercel Cron route protected by a secret. It deletes photos and records 90 days after an item is `collected` or `archived`, plus orphaned uploads. It has little to do until Phase 3, but it'll be tested and running from launch.

**9. Rate limiting needs a store.**
Serverless functions don't share memory between requests. Upstash would add another service.
*Proposal:* a Postgres `rate_limits` table with an atomic `hit(key, window, max)` function. That's enough at pilot scale, and it's free.

**10. Tier 0 relies on category groups, which §7 doesn't define.**
*Proposal:* add a `categories.group_slug` column now (for example, earbuds and headphones both go in `audio`), so the Phase 2 matcher has the data.

**11. Multi-campus support.**
*Proposal:* create a `campuses` table with one row, and add `campus_id` to `buildings`, `categories` and `drop_off_points` only. Items get their campus through their building. Adding tenancy later is then an additive migration. There's no tenancy UI or logic.

**12. Things I won't show in Phase 1, following rule 7.**
- `/me` shows "My posts" only. Lost reports (Phase 2) and claims (Phase 3) don't appear at all; there are no empty sections for them.
- The item detail page has no "This is mine" button. It says "Ask for it at the {drop-off point}", which is accurate before the claim flow exists. "I lost something" on the landing page leads to sign-in, then to browse, until Phase 2 adds lost reports.

**13. Supabase free tier pauses inactive projects.**
Free projects pause after 7 days without activity. That doesn't matter for dev, but the pilot needs either regular traffic or the $25/mo Pro plan. **This is a possible paid service, so I'm flagging it now.** The `/api/health` cron ping keeps the project awake, but don't rely on it for production.

---

## B. Phase 0: Foundation

Each bullet is roughly one commit. Tests are written in the same commit as the code they cover.

1. **Scaffold:** `git init`, current stable Next.js App Router, TypeScript `strict` plus `noUncheckedIndexedAccess`, ESLint (with `no-console`), Prettier, npm, and the §18 folder layout.
2. **Env and logging:** a Zod-validated `lib/env.ts` (the build fails on a missing variable), `.env.example`, a pino JSON logger, the Sentry SDK, and `/api/health`, which pings the database and returns no sensitive detail.
3. **Security baseline:** middleware that sets a nonce CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors 'none'`. CSRF protection is an Origin/Host check on every mutating request, layered on Server Actions' built-in origin check and SameSite=lax cookies. Integration tests assert each header and that a cross-origin POST returns 403.
4. **Design tokens:** `styles/tokens.css` defines `--color-*`, `--space-*`, `--radius-*` and `--font-*`, redefined for dark mode. Tailwind's theme maps only to these variables; raw palette classes are disabled by lint. The palette is a calm transit-signage style: deep slate ink, a teal primary and a marigold accent for "found". A unit test computes WCAG contrast for every foreground/background token pair in both themes, so CI fails below AA.
5. **Theming:** follows the system setting by default, with a manual override stored in a cookie and rendered on the server, so there's no flash and no inline script. Includes `prefers-reduced-motion` handling and the focus-ring token.
6. **shadcn/ui:** button, input, label, dialog and toast, restyled to the tokens. Touch targets are at least 44 px.
7. **Schema migrations** (Supabase CLI, plain SQL): every §7 table plus `item_private`, `drop_off_points`, `campuses`, `rate_limits` and `metrics_events`. UUID primary keys, enums, the generated `search_tsv` (description only, never the secret), every §13 index, and the `vector` extension enabled. The `embedding` column waits for Phase 4.
8. **RLS:** enabled on every table, default deny, with policies per role. Role checks call a `security definer` function `app_role()` that reads `users.role`, never a JWT claim. A private storage bucket gets path policies. **Integration tests** run against the CI Supabase stack as anon, student A, student B, staff and admin, and include a "someone else's data" denial case for every table.
9. **Seed:** about 20 categories with groups, the 10 §10.3 sensitive categories, about 30 Davidson buildings with approximate coordinates, three drop-off points and one campus. Everything lives in `supabase/seed.sql`, commented so you can correct it.
10. **Auth:** the `lib/auth/` interface (`getSession`, `requireUser`, `requireRole`, `sendMagicLink`, `signOut`) with a Supabase implementation using `@supabase/ssr` cookies (httpOnly, secure, lax, 30-day sliding). Adds the domain trigger from issue 5 and a trigger that creates the `users` row. Rate limits are 3 per email per 15 minutes and 10 per IP per hour. Pages: `/sign-in` and `/auth/callback`. Tests cover a non-Davidson email rejected at all three layers, the rate limit, and `requireRole` refusing a student.
11. **CI** (GitHub Actions): lint, typecheck, unit, integration (`supabase start` followed by migrations and seed), and axe on public routes. Any failure fails the build.
12. **README:** setup, environment variables, and how to run tests and migrations.

**Done check:** you sign in with your Davidson email on a Vercel preview, CI is green, and the seeded tables are visible in Supabase.

## C. Phase 1: Post and browse

1. **Image pipeline (`lib/images`):** `file-type` magic-byte sniffing (JPEG, PNG, WebP or HEIC only), a size cap, then sharp: auto-rotate, full re-encode to WebP at 400, 800 and 1600 px, and a blurhash from a 32 px version. Metadata is never carried over. Unit tests use fixtures: a GPS-tagged JPEG must produce output with no EXIF; a PNG renamed `.jpg` is sniffed correctly; an HTML file renamed `.jpg` is rejected; an oversize file is rejected.
2. **Post a found item: server side.** One server action does Zod validation, the honeypot check, the 5-per-hour-per-IP rate limit, the image pipeline, and storage writes under `items/{uuid}/`. It inserts `items` and `item_private` in a single transaction. The secret and contact email are encrypted with AES-256-GCM using an app key from the environment. `is_sensitive` is copied from the category by a trigger, never sent by the client. It records a `time_to_post` metric event. Integration tests cover anonymous success, the rate limit, the honeypot, a forged `is_sensitive`, and checking that no finder fields appear in any response.
3. **Post a found item: the screen (`/found/new`).** In this order:
   - The photo button is a real `<input type="file" accept="image/*" capture="environment">`, so phones open the camera directly and it works without JavaScript.
   - Then the category grid and the building list. With permission, the building list sorts nearest-first using geolocation calculated in the browser only; coordinates are never sent to the server.
   - Then the secret field, with the helper line *"Add one detail only the owner would know — it's how we'll know it's really theirs."*
   - Then the collapsed "Tell me when it's returned" email field.
   - The primary button sits fixed in the bottom third of the screen.
   - The draft (photos as blobs plus fields) is saved in IndexedDB and restored on reload.
   - The form still works as a plain multipart POST without JavaScript; the in-browser resize only runs when JavaScript is available.
   - Errors are announced with `aria-describedby` and a live region.
4. **Success page (`/found/new/success`):** "Posted." Then the drop-off choice from issue 1, with a building-level map link per point.
5. **Browse (`/items`):** auth-gated, `noindex`, server-rendered.
   - Filters (category, building, date range) and search (`websearch_to_tsquery` over `search_tsv`, limited to 60 searches per minute per user) are a GET form, so they work without JavaScript.
   - Paging is a keyset cursor, 24 items per page, with a "Load more" link that becomes infinite scroll when JavaScript is available.
   - One query fetches the page, and one batch `createSignedUrls` call signs every photo for 15 minutes, so there's no N+1.
   - Placeholders are blurhashes decoded on the server into tiny inline data URIs, so they show even without JavaScript.
   - Responsive `srcset` and lazy loading below the fold.
   - Alt text is generated, for example "Black water bottle found in Chambers".
   - Sensitive items show placeholder cards.
   - Empty states give instructions.
6. **Item detail (`/items/[id]`):** a photo carousel, category, building, date, description and where to collect it. A sensitive item shows the placeholder to students and full detail to staff. Tests: a student gets 404 for a sensitive item's photo path; the poster can see their own secret and others can't.
7. **`/me`:** my posts (only those made while signed in), each with edit description and remove. Remove is a confirmable soft-archive. Both write to `audit_log` with an HMAC-hashed IP.
8. **Landing (`/`), `/about` and `/privacy`:**
   - Two actions above the fold, server-rendered.
   - Metadata, canonical URLs, Open Graph and Twitter images via `next/og`.
   - JSON-LD (`Organization` and `FAQPage`) on `/about`.
   - `robots.txt` disallows the app routes; `sitemap.xml` lists the public routes.
   - `/privacy` ships in this phase because real people's photos start arriving here. It's written in plain language for you to review; it isn't legal advice.
9. **Retention cron:** the purge job from issue 8, with tests.
10. **QR code:** a printable poster PDF/PNG linking to `/found/new?src=qr`. The `src` value feeds the time-to-post metric.
11. **End-to-end tests (Playwright, 375 px viewport):**
    - an anonymous user posts with a fixture photo, and the post completes;
    - a signed-in student finds that item through a filter and through search;
    - an anonymous user hitting `/items` is redirected.
    - axe runs on every public route in both themes.
12. **Performance pass:** Lighthouse CI on `/` and `/items` (mobile ≥ 90; SEO and a11y ≥ 95 on public pages), plus a review of `pg_stat_statements` for N+1 queries before calling the phase done.
13. **Timed posting test:** I'll time QR scan → posted on a real phone over throttled 3G and write the number in DECISIONS.md. If it's over 15 seconds, the phase isn't done.

---

## D. What I need from you

1. **Approve this plan, or argue with §A.** Issues 1, 2 and 3 are the ones that change the product.
2. **A Supabase dev project.** Create it at supabase.com (free), then put the URL, anon key and service-role key in `.env.local` yourself. Don't paste them into chat.
3. **A GitHub repo** for CI (empty, private is fine), and a **Vercel account** linked to it.
4. **Email sending.** Resend needs a verified domain to email anyone other than the account owner. For the Phase 0 sign-in check, create the Resend account with your own Davidson email; that's enough for testing. Before the pilot you'll need a domain (about $10–15/yr, another small cost I'm flagging).
5. **Are Chambers and Wall staffed desks or bins?** This changes the drop-off copy.
