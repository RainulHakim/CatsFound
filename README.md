# CatFound

A mobile-friendly web app (for now), launched through the Union, that matches finder-submitted photos against loser-submitted descriptions or photos, with verification.

A peer-to-peer lost & found for Davidson College. Finders post in seconds without an account; students search, and (from Phase 2) get an email the moment something matching turns up. See [SPEC.md](SPEC.md) for the product, [PLAN.md](PLAN.md) for the build plan and [DECISIONS.md](DECISIONS.md) for why things are the way they are.

**Status:** Phase 0 (foundation) built. Sign-in is switched off (`AUTH_ENABLED=false`) until the hosted Supabase project is set up; see [Turning on sign-in](#turning-on-sign-in).

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind v4 with CSS-variable tokens · Supabase (Postgres + RLS, Auth, Storage) · Zod · Vercel · Vitest + Playwright + axe.

## Setup

Requires Node 22+ (`.nvmrc`).

```bash
npm install
cp .env.example .env.local     # then fill it in (below)
npm run dev                    # http://localhost:3000
```

### Environment

| Variable                                                           | Where it comes from                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys                                                                              |
| `SUPABASE_SECRET_KEY`                                              | Same page, **Secret keys**. Server-only; bypasses RLS.                                                              |
| `SUPABASE_DB_URL`                                                  | Supabase → Connect → _Session pooler_ connection string (includes the DB password). Only used by `npm run db:push`. |
| `NEXT_PUBLIC_SITE_URL`                                             | `http://localhost:3000` locally; the production URL on Vercel.                                                      |
| `APP_ENCRYPTION_KEY`                                               | `openssl rand -base64 32`                                                                                           |
| `IP_HASH_SALT`, `CRON_SECRET`                                      | `openssl rand -hex 32` each                                                                                         |
| `SENTRY_DSN`                                                       | Optional. Sentry project DSN. Nothing is sent when unset.                                                           |

Set the same variables in Vercel (Project → Settings → Environment Variables), with `NEXT_PUBLIC_SITE_URL` set to the deployed URL.

### Database

Migrations live in `supabase/migrations`, seed data in `supabase/seed.sql`.

```bash
npm run db:push        # applies migrations + seed to the project in SUPABASE_DB_URL
```

**The building list in `supabase/seed.sql` is a placeholder.** The names are real Davidson buildings, but the coordinates are approximate. Correct them there and re-run the push; the seed is idempotent.

### Supabase dashboard settings (one-time)

Sign-in needs these settings in the hosted project:

1. **Authentication → URL Configuration.** Set _Site URL_ to the app's URL, and add `<site>/auth/confirm` to _Redirect URLs_.
2. **Authentication → Emails → SMTP Settings.** Turn on custom SMTP with Resend: host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key. Supabase's built-in mailer only delivers to project team members.
   Until a domain is verified in Resend, mail only reaches the address that owns the Resend account.
3. **Authentication → Emails → Templates.** For both **Magic Link** and **Confirm signup**:
   - Subject: `Your CatFound sign-in code`.
   - Body: paste [`supabase/templates/magic_link.html`](supabase/templates/magic_link.html).
     This template sends a 6-digit code plus a link, and the link works even when it's opened in a phone's mail app.
4. **Authentication → Providers → Email.** Set _Email OTP expiration_ to `900` seconds and _Email OTP length_ to `6`.

The `@davidson.edu` restriction is enforced by a database trigger on `auth.users`, so it holds even if someone calls Supabase Auth directly.

### Turning on sign-in

Sign-in is hidden, and its pages and actions are disabled, while `AUTH_ENABLED` is anything other than `true`. Turn it on only after all of these are done:

1. `SUPABASE_SECRET_KEY` and `SUPABASE_DB_URL` are in `.env.local`.
2. `npm run db:push` has applied the migrations and seed. `GET /api/health` returns `200` with `"db":"ok"`.
3. The dashboard settings above are in place: Resend SMTP, the email template, and the redirect URLs.

Then set `AUTH_ENABLED=true`, locally in `.env.local` and in Vercel's environment variables. Sign-in code is tested end-to-end in CI regardless of this flag.

## Scripts

| Command                                       | What it runs                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint` / `typecheck` / `format:check` | ESLint (incl. `no-console`), `tsc` with generated route types, Prettier                                                             |
| `npm test`                                    | Unit tests (Vitest)                                                                                                                 |
| `npm run test:coverage`                       | Unit tests with the 80% coverage gate on `lib/` and `app/api/`                                                                      |
| `npm run test:db`                             | Schema + RLS tests. Uses in-process PGlite by default; `DB_TARGET=pg DATABASE_URL=…` runs them against real Postgres (CI does this) |
| `npm run test:http`                           | Security headers, CSP nonce, CSRF, health (needs `npm run build` first)                                                             |
| `npm run test:e2e`                            | Playwright e2e and axe accessibility checks at 375px, light and dark                                                                |

CI (`.github/workflows/ci.yml`) runs all of the above on every push. It starts a disposable Supabase stack with `supabase start`, so the RLS suite and a full email-code sign-in also run against real Supabase.

## Layout

```
app/            routes, server actions (app/actions), API routes (app/api)
components/     UI; components/ui holds the shadcn-style primitives
lib/auth/       auth interface + Supabase implementation (swap for SSO here)
lib/db/         Supabase clients, cookie hardening, DB types
lib/security/   CSP, CSRF, IP hashing, safe redirects
lib/validation/ Zod schemas shared by client and server
proxy.ts        per-request CSP nonce, CSRF check, session refresh
supabase/       migrations, seed, email template, local config
tests/          unit, integration (db + http), e2e, a11y
```
