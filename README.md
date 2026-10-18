# CatFound

A mobile-friendly web app (for now), launched through the Union, that matches finder-submitted photos against loser-submitted descriptions or photos, with verification.

A peer-to-peer lost & found for Davidson College. Finders post in seconds without an account; students search, and (from Phase 2) get an email the moment something matching turns up. See [SPEC.md](SPEC.md) for the product, [PLAN.md](PLAN.md) for the build plan and [DECISIONS.md](DECISIONS.md) for why things are the way they are.

**Status:** Live at **https://catsfound.vercel.app**. Phase 1 (post and browse) is working: anyone can post a found item with photos, and anyone can browse and search what's been found. Sign-in is switched off (`AUTH_ENABLED=false`), so browsing is public for now (still hidden from search engines); see [DECISIONS.md](DECISIONS.md).

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind v4 with CSS-variable tokens · Postgres on **Neon** with row-level security · **Vercel Blob** (private) for photos · sharp for the image pipeline · Zod · Vercel · Vitest + Playwright + axe. Supabase Auth code is kept behind `lib/auth/` for when sign-in returns.

## Setup

Requires Node 22+ (`.nvmrc`).

```bash
npm install
cp .env.example .env.local     # then fill it in (below)
npm run dev                    # http://localhost:3000
```

### Environment

The Neon database and Blob store are connected to the Vercel project, so their variables (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BLOB_READ_WRITE_TOKEN`, …) are managed by Vercel. To get them locally:

```bash
npx vercel link --project catsfound
npx vercel env pull .env.local     # merges; keeps your other local values
```

You also need these values yourself:

| Variable                      | Notes                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`        | `http://localhost:3000` locally; `https://catsfound.vercel.app` in Vercel  |
| `APP_ENCRYPTION_KEY`          | `openssl rand -base64 32`. Encrypts the "only the owner would know" detail |
| `IP_HASH_SALT`, `CRON_SECRET` | `openssl rand -hex 32` each                                                |
| `AUTH_ENABLED`                | `false` until sign-in is set up                                            |
| `SENTRY_DSN`                  | Optional                                                                   |

Without `BLOB_READ_WRITE_TOKEN`, photos go to a local `.data/photos` folder instead, which is how CI runs.

> **Note:** the pulled `DATABASE_URL` is the **live** database. Anything you post from `npm run dev` shows up on the real site. For separate dev data, create a Neon branch and point `.env.local` at it.

### Database

Migrations live in `supabase/migrations`; `db/bootstrap.sql` adds the few Supabase-style roles and the `auth.uid()` function that plain Postgres doesn't have.

```bash
npm run db:migrate     # bootstrap + new migrations + idempotent seed
```

**The building list in `supabase/seed.sql` is a placeholder.** The names are real Davidson buildings, but the coordinates are approximate. Correct them there and re-run `npm run db:migrate`.

### Retention

`/api/cron/purge` runs daily via Vercel Cron (`vercel.json`). It deletes items and their photos 90 days after they're collected or archived, expires old lost reports, trims the audit log to one year, and prunes rate-limit counters.

### Turning on sign-in (later)

The magic-link/code sign-in in `lib/auth/` is written for Supabase Auth. Now that data lives in Neon, sign-in needs either a Supabase project used only for auth, or a new provider behind the same `lib/auth` interface; Neon Auth is already provisioned (`NEON_AUTH_BASE_URL`). Until then, keep `AUTH_ENABLED=false`.

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
lib/db/         Postgres access (withActor: anon vs service), Supabase auth clients
lib/images/     upload pipeline: type sniffing, EXIF-stripping WebP re-encode, blurhash
lib/storage.ts  private photo storage (Vercel Blob, or local folder)
lib/security/   CSP, CSRF, IP hashing, safe redirects
lib/validation/ Zod schemas shared by client and server
proxy.ts        per-request CSP nonce, CSRF check, session refresh
supabase/       migrations, seed, email template, local config
tests/          unit, integration (db + http), e2e, a11y
```
