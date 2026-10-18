# Decisions

A running log of non-obvious choices and the reasons for them. Newest at the bottom.

## 2026-10-17 — Answers to SPEC §19 open questions

| #   | Question             | Answer                                                                                                    |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Auth                 | Magic link now, behind `lib/auth/`. Davidson SSO is a later swap.                                         |
| 2   | Backend              | Supabase (Postgres + Auth + Storage + pgvector).                                                          |
| 3   | Buildings            | Seed realistic placeholders in one seed file for correction.                                              |
| 4   | "Valuable" threshold | The §10.3 sensitive-category list only. No per-item flag.                                                 |
| 5   | Finder email         | Optional, collapsed behind a toggle after the main fields, stored encrypted.                              |
| 6   | Drop-off points      | Several: Alvarez Union desk, Chambers, Wall. Sensitive items go to the Union only (see PLAN.md, issue 1). |
| 7   | Branding             | Visually independent. "Davidson" appears only as a place name in copy.                                    |

## 2026-10-17 — Development database

No Docker on the dev machine. Local development points at a hosted Supabase dev project. CI runs `supabase start` on GitHub Actions runners, which do have Docker, so RLS and integration tests run against a real, disposable Supabase stack.

## 2026-10-17 — Phase 0 technical choices

**Cache Components / PPR off.** Next 16 scaffolds with `cacheComponents: true`, which turns on Partial Prerendering. The Next docs state PPR is incompatible with nonce-based CSP, and SPEC §10.1 requires a CSP without `unsafe-inline`. Every page renders dynamically instead. The experimental SRI/hash mode was rejected: it can't cover the inline scripts Next streams with each page.

**Proxy runs on every request, prefetches included.** The Next docs' example matcher skips requests carrying `next-router-prefetch`/`purpose: prefetch` headers. Any client can set those headers, so the exclusion would let a forged POST skip the CSRF check. An HTTP test asserts this.

**CSRF = Origin must match Host, plus Fetch Metadata.** This sits on top of SameSite=lax cookies and Next's built-in Server Action origin check. A POST with no `Origin` header is rejected. Browsers always send one on POST, and cron jobs use GET.

**Sign-in: 6-digit code plus a link that signs in on POST.** The PKCE magic-link flow breaks when the link opens in a different browser, such as a phone's mail app. Microsoft Safe Links and other mail scanners also prefetch links, which would use up a one-time token. So the email carries a code (works on any device), and the link lands on `/auth/confirm`, which signs in only when the user presses a button.

**Session cookies hardened by us, not the library.** `@supabase/ssr` defaults to `httpOnly: false` and a 400-day `maxAge`. We never use the browser client, so every auth cookie write goes through `hardenCookieOptions`, which sets httpOnly, SameSite=lax, Secure on https, and a 30-day maxAge. Cookies are rewritten on every token refresh (hourly while active), so 30 days without activity signs you out. Supabase's server-side session timeout is a paid feature, so the cookie expiry is what enforces the 30 days.

**Email domain enforced in the database.** A `before insert or update of email` trigger on `auth.users` rejects anything not matching `^[a-z0-9._-]+@davidson\.edu$`, which also blocks plus-addressing. The Zod schema mirrors the rule only to give a friendlier error message.

**Rate limiter: Postgres fixed window, fails closed.** No Redis or Upstash, because it isn't needed at pilot scale. If the limiter can't reach the database, sign-in is refused rather than left unthrottled. The database being down breaks sign-in anyway.

**RLS tests run on PGlite locally and on real Supabase in CI.** There's no Docker on the dev machine. The harness emulates the Supabase roles and `auth.uid()` for PGlite. CI reruns the identical suite with `DB_TARGET=pg` against `supabase start`. The PGlite run skips only the pgvector `create extension` line, because nothing uses pgvector before Phase 4.

**Env validated lazily, not at build time.** This changes PLAN.md B.2. Failing the build on a missing server secret would block Vercel preview builds of pages that never touch it. Each accessor validates on first use and names the missing variable.

**shadcn-style primitives written by hand.** The shadcn CLI would overwrite `globals.css` with its own token set. The few primitives we need (button, field, notice) follow its patterns (cva variants, semantic HTML) but are built on our tokens. More get added as phases need them.

**Health check uses GET, not HEAD.** supabase-js reports no error for a HEAD request that 404s, so a missing schema looked healthy. This was found while testing against the un-migrated hosted project.

**Sentry: server-side only for now.** The SDK loads only when `SENTRY_DSN` is set, and every data-collection category is off, including URL query params, since sign-in links carry tokens. Client-side capture waits until Phase 1, where its bundle cost can be weighed against the Lighthouse budget.

## 2026-10-17 — Sign-in switched off behind `AUTH_ENABLED`

Sign-in failed on the hosted project for three setup reasons, none of them code bugs: `SUPABASE_SECRET_KEY` was missing, so the action crashed on the env check; the migrations hadn't been applied, so there was no rate-limit function and no `users` table; and custom SMTP wasn't configured. Following rule 7 (if it doesn't work, it isn't in the UI), sign-in is hidden behind a server-side `AUTH_ENABLED=true` flag. Off means no sign-in links, 404 on `/sign-in` and `/auth/confirm`, and the Server Actions refuse requests even if called directly by action ID. It's an explicit flag rather than auto-detection, because no environment check can confirm that SMTP actually delivers mail. The sign-in actions now catch provider and configuration errors and show a message instead of crashing the page. CI and the Playwright test server run with the flag on, so the sign-in path stays tested.

## 2026-10-18: Neon + Vercel Blob instead of Supabase (for now)

You wanted a working demo, and every Supabase route needed a dashboard step that didn't complete: a missing secret key, a token that never reached `.env.local`, and a Vercel–Supabase marketplace install that never registered. Neon could be provisioned entirely from the Vercel CLI, so after you chose it explicitly, the app now runs on:

- **Neon Postgres** for data. The same migrations run there. `db/bootstrap.sql` recreates the slice of Supabase they assume: the `anon`/`authenticated`/`service_role` roles, `auth.uid()` reading `request.jwt.claim.sub`, and `auth.users`. The PGlite test harness uses the same file.
- **RLS still applies.** Every request runs in a transaction through `withActor`. Public reads use `SET LOCAL ROLE anon`, so grants and policies are enforced exactly as on Supabase. Server writes (posting, jobs) run as the owner after the server has validated them.
- **Private Vercel Blob** for photos. Objects aren't publicly addressable. `/api/photos/[id]/[width]` asks the database whether the photo may be shown (an open item, not in a sensitive category) and streams it. That replaces Supabase's 15-minute signed URLs; the effect is the same, since a photo stops being served as soon as its item is claimed or turns out to be sensitive (with a 5-minute cache).
- **Trade-off:** the sign-in code is written for Supabase Auth and stays switched off. Bringing it back means a Supabase project used only for auth, or another provider (Neon Auth is provisioned), behind `lib/auth`.

## 2026-10-18: Public browsing while sign-in is off

SPEC §10.2 says the item index should be visible only to signed-in users. With sign-in off, a gated index would make the site useless for a demo, so `browse_items` / `get_item` / `photo_object` are granted to `anon`. Everything else in §10 still holds:

- `noindex` plus `robots.txt` disallow on `/items`.
- No photos or details for sensitive items.
- Finder identity and the secret are never selected.
- Building-level location only.

**Revoke `anon` execute on those three functions when sign-in returns.**

## 2026-10-18: Phase 1 implementation notes

- **Photos are resized in the browser to 1600px JPEG before upload**, which takes about 0.1 s on a phone. That keeps four photos under Vercel's 4.5 MB request cap (Server Action limit set to 4.4 MB). The server still sniffs the type, re-encodes to WebP at 400/800/1600, and drops all metadata; that step is tested with GPS-tagged fixtures.
- **Measured locally against the live database:** form load 0.6 s, photo resize 0.1 s, submit to confirmation 2.1 s. That leaves over 10 s of the 15 s budget for the person.
- **Blurhash placeholders are decoded server-side into tiny PNG data URIs** rendered as an `<img>` under the photo. Inline `style` would break the CSP, and this way it also works without JS.
- **The drop-off choice comes after posting.** The finder proves they just posted the item with an HMAC token in the success URL, valid for 2 hours. A DB trigger refuses any sensitive item at a point that doesn't accept them.
- **The "tell me when it's returned" email field isn't shown.** The notification it promises belongs to Phase 3, and rule 7 says unbuilt features don't appear in the UI. The column and encryption are ready.
- **"I lost something" goes to browse.** Lost-report alerts are Phase 2.
- **Retention purge built now,** because the privacy page states the 90-day rule.
