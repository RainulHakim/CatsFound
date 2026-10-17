# CatFound — Build Specification

> **Working name:** CatFound (placeholder — find-and-replace if you pick something else).
> **Hand this file to Claude Code.** Put it in the repo root as `SPEC.md` and open with:
> *"Read SPEC.md. Follow the 'How to work' section. Start with Phase 0."*

---

## How to work (read this first)

1. **Do not one-shot this.** Read the whole spec, then produce a written implementation plan for Phase 0 and Phase 1 only. Wait for my approval before writing code.
2. **Ask me the questions in "Open questions" before you start.** Don't guess on auth or hosting.
3. **Build in the phase order given.** Each phase must be deployable and usable on its own. Do not start Phase 2 work during Phase 1.
4. **Commit granularly** with conventional commits (`feat:`, `fix:`, `chore:`). One logical change per commit.
5. **Write the test as you write the feature**, not at the end.
6. **When a requirement here is ambiguous or you think it's wrong, say so instead of silently picking.** I'd rather argue than get a wrong build.
7. **No placeholder/TODO code in a phase you've declared complete.** If a thing isn't built, it isn't in the UI.
8. Keep a running `DECISIONS.md` logging every non-obvious technical choice and why.

---

## 1. Context

Davidson College has a lost-and-found desk at the Alvarez Union. Most students don't know it exists. Items pile up unclaimed because owners never see them — the only way to find your thing is to physically walk over and look.

The Alvarez Union has committed to supporting this project and will act as the launch site: staff will help log found items and mediate handoffs.

Existing commercial products (RepoApp, vFound, FoundFastApp) are **staff-facing dashboards** — an office logs items and manages claims. This product flips that: **students post and find items peer-to-peer**, with staff as a backstop for valuables rather than a gatekeeper for everything.

**One-sentence goal:** cut the time between "someone found your thing" and "you know about it" from never to minutes.

---

## 2. Product principles

These are the non-obvious decisions. Don't quietly reverse them.

**P1 — Posting speed is the product.** The whole system is worthless if finders don't post. Target: **under 15 seconds** from QR scan to posted item, on a phone, one-handed, with no account. Every feature that adds friction to posting must justify itself or be cut.

**P2 — Lost reports are alerts, not posts.** A "lost item" report is a standing, private subscription that watches for matches. It is never a public feed post. This prevents the noise that kills every lost-and-found board.

**P3 — AI ranks, it does not filter.** Visual similarity runs *only* within a candidate set already narrowed by category, date, and location. It never searches the whole corpus. Reason: at this scale, visual search over all items returns every black object when you look for a black object.

**P4 — Valuables go through the Union desk.** Peer handoff is for low-value items under the honor code. Wallets, IDs, keys, phones, laptops, and cards are staff-mediated, always. No exceptions configurable by users.

**P5 — Default to private.** Finder identity, claimant identity, and exact find locations are never public. Building-level granularity only.

**P6 — Works on a bad phone on campus wifi.** Mobile-first, fast on 3G, degrades without JS for the core browse view.

---

## 3. Scope

### In scope (v1)
- Post a found item (photo + category + where + optional notes), no account required
- Browse and search found items (auth required)
- File a lost report that silently watches for matches
- Email/push notification when a match appears
- Claim an item, with owner verification
- Staff console for the Union desk
- Marketing/landing page

### Explicitly out of scope — do not build
- Native iOS/Android apps (phase 2 of the business, not this build)
- In-app chat or DMs
- Payments, rewards, or bounties
- Social features: profiles, follows, comments, likes
- Multi-campus / tenanting (design the schema so it's *possible* later, build single-tenant now)
- Any admin feature the Union didn't ask for

---

## 4. Users and roles

| Role | Auth | Can do |
|---|---|---|
| **Anonymous finder** | None | Post a found item. Nothing else. |
| **Student** | Davidson email | Browse, search, file lost reports, claim items, manage own posts |
| **Staff** (Union desk) | Davidson email + role flag | Everything students can, plus: see sensitive-category items, approve/deny claims, mark items collected, edit/remove any item |
| **Admin** | Role flag | Staff powers + user role management + audit log access |

Roles live in the database, never in a JWT claim the client can forge. Check role server-side on every protected action.

---

## 5. Core flows

### 5.1 Post a found item (the critical path)

```
Scan QR at Union desk / poster
  → Landing page, "I found something" is the primary button
  → Camera opens immediately (not a file picker)
  → Snap photo
  → Auto-suggested category (from image, with manual override)
  → Pick location from a short list of campus buildings (nearest-first if geolocation allowed)
  → [Optional] "Anything only the owner would know?" — a private detail, e.g. "small dent by the left bud"
  → Post
  → Confirmation: "Posted. Drop it at the Union desk." + a map link
```

**Requirements:**
- No account, no email, no name required to post.
- The optional private detail field is the **verification secret**. It's stored encrypted-at-rest and shown only to staff and the finder. Explain it in one short line of helper text — this is the single highest-value field in the app and most people will skip it unless you ask well.
- Multiple photos allowed (max 4), one required.
- If the user abandons mid-flow, keep a local draft so a reload doesn't lose the photo.

### 5.2 Browse / search found items
- Grid of photo cards, newest first.
- Filters: category, date range, building.
- Text search over description and notes.
- Sensitive-category items (see §8.3) show as a generic placeholder card — "A wallet was found in Chambers on Oct 12, see the Union desk" — with **no photo** and no detail.

### 5.3 File a lost report
```
"I lost something"
  → Category, approximate date lost, buildings where it might be
  → Description + distinguishing marks (free text)
  → [Optional] photo of the item (from a previous picture of it)
  → Submit
  → "We'll email you the moment something matching turns up."
```
This creates a **standing alert**. It runs immediately against existing items, then against every new item as it's posted. It is not displayed publicly anywhere.

### 5.4 Claim an item
```
Student sees a match (in a notification or while browsing)
  → "This is mine"
  → If the finder left a verification secret: "The person who found this noted a detail. What is it?"
      → Correct → claim auto-approved (low-value) or queued for staff (valuable)
      → Wrong → one retry, then queued for staff review
  → If no secret exists: describe the item in your own words + honor-code pledge checkbox
      → Low-value → approved, pickup instructions shown
      → Valuable → queued for staff review at the Union desk
  → Item marked Claimed, removed from public browse
  → Finder notified that it found its owner (without the claimant's identity)
```

### 5.5 Staff console
- Queue of pending claims with the finder's secret and the claimant's answer side by side
- Approve / deny / request more info
- Mark item as collected (closes the loop)
- Log an item on a student's behalf (walk-ins who don't use the app)
- Bulk-archive unclaimed items past the retention window

---

## 6. Screens

```
/                        Landing (public, SEO target)
/found/new               Post a found item (public, no auth)
/found/new/success       Confirmation + drop-off instructions
/items                   Browse grid (auth)
/items/[id]              Item detail (auth)
/items/[id]/claim        Claim flow (auth)
/lost/new                File a lost report (auth)
/me                      My lost reports, my posts, my claims (auth)
/staff                   Staff console (staff role)
/staff/claims            Claim review queue (staff role)
/about                   How it works (public, SEO)
/privacy                 Privacy policy (public — you genuinely need one)
```

---

## 7. Data model

Postgres. Use UUIDs for all public-facing IDs — never expose sequential integers.

```sql
users
  id, email (unique, @davidson.edu), display_name, role (student|staff|admin),
  notification_prefs jsonb, created_at

items                                    -- found items
  id, status (open|claimed|collected|archived),
  category_id, color_tags text[],
  building_id, found_at date,
  description text, 
  verification_secret text,              -- encrypted at rest; nullable
  is_sensitive bool,                     -- derived from category, see §8.3
  posted_by uuid null,                   -- null = anonymous finder
  posted_by_contact text null,           -- optional, encrypted
  embedding vector(512) null,            -- phase 4
  search_tsv tsvector,                   -- generated column
  created_at, archived_at

item_photos
  id, item_id, storage_path, width, height, blurhash, sort_order

lost_reports
  id, user_id, status (active|matched|resolved|expired),
  category_id, color_tags text[],
  building_ids uuid[], lost_after date, lost_before date,
  description text, distinguishing_marks text,
  reference_photo_path null, embedding vector(512) null,
  created_at, expires_at                 -- default 90 days

matches
  id, lost_report_id, item_id,
  score numeric, tier smallint,          -- 0=deterministic 1=text 2=visual
  notified_at, dismissed_at,
  unique(lost_report_id, item_id)

claims
  id, item_id, claimant_id,
  status (pending|approved|denied|collected),
  verification_answer text,              -- encrypted
  verification_passed bool null,
  honor_pledge_accepted bool,
  reviewed_by uuid null, reviewed_at, notes text,
  created_at

categories
  id, name, slug, is_sensitive bool, icon, sort_order

buildings
  id, name, slug, lat, lng, is_active

audit_log
  id, actor_id, action, entity_type, entity_id, metadata jsonb, ip_hash, created_at
```

**Seed data required:** a realistic list of Davidson buildings (Alvarez Union, Chambers, Baker Sports Complex, the library, dorms, etc. — ask me for the full list) and ~20 categories.

---

## 8. Matching engine

Build this in tiers. **Tier 0 ships in Phase 2 and must work well on its own.**

### Tier 0 — Deterministic (required)
Pure SQL. For a given lost report, candidate items are those where:
- `category_id` matches, **or** category is in the same category group
- `found_at` falls within `[lost_after - 2 days, lost_before + 14 days]`
- `building_id` is in the report's building list, **or** within 400m of one
- `status = 'open'`

Score = weighted sum of category exactness, date proximity, building exactness, and color-tag overlap. Notify above a configurable threshold.

### Tier 1 — Text (required)
Postgres full-text search: the lost report's `description + distinguishing_marks` against the item's `search_tsv`. Used to **re-rank Tier 0 candidates**, and to power the browse search box.

### Tier 2 — Visual (Phase 4, optional)
- CLIP (or equivalent) image embeddings, stored in `pgvector`.
- **Only runs against the Tier 0 candidate set.** Never a global nearest-neighbour search over all items.
- Re-ranks candidates; cannot introduce a candidate Tier 0 excluded.
- Cache embeddings on upload. One embedding per item, computed once, never recomputed.
- If the embedding provider is down or over budget, the system silently falls back to Tier 0+1. **Matching must never hard-depend on an external AI API.**

### Notification rules
- Max one notification per lost report per day; batch multiple matches into one email.
- Never notify twice about the same item.
- Every notification has a one-click "not mine" that writes `dismissed_at` and suppresses re-matching.

---

## 9. Auth

**Preferred:** Davidson SSO (SAML/OIDC) if IT will grant it.
**Fallback (build this first):** magic-link email, hard-restricted to `@davidson.edu` addresses.

Put auth behind a thin interface (`lib/auth/`) so the provider can swap without touching feature code. College IT approval is slow — do not block the build on it.

- Sessions: httpOnly, secure, sameSite=lax cookies. No tokens in localStorage.
- Session lifetime 30 days, sliding.
- Rate limit magic-link requests: 3 per email per 15 min, 10 per IP per hour.

---

## 10. Security and privacy

This handles photographs of students' possessions and their location history. Treat it as sensitive.

### 10.1 Non-negotiable
- **Row-level security on every table.** Default deny. A student can read their own lost reports and claims, and open non-sensitive items. Nothing else.
- **Strip EXIF from every uploaded image, server-side, before storage.** Phone photos carry GPS. Re-encode the image rather than trusting a metadata-strip library.
- **Photos in a private bucket, served via short-lived signed URLs** (15 min). Never a public bucket.
- **Validate every input with Zod at the API boundary.** No exceptions, including internal endpoints.
- **Uploads:** sniff the real MIME type (don't trust the extension or the client), cap at 10MB, re-encode to WebP server-side. This also strips any embedded payload.
- Parameterized queries only. No string-built SQL anywhere.
- Security headers: HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors none, and a real CSP (no `unsafe-inline`).
- CSRF protection on all mutating routes.
- Secrets in environment variables, never committed. Ship a `.env.example`.
- Rate limit: posting items (5/hour/IP), claims (10/day/user), search (60/min/user).

### 10.2 What is never exposed
- Finder identity — not on the item card, not in the API response, not in the HTML source.
- Claimant identity — to anyone but staff.
- Exact coordinates — building-level only, publicly. Never store or display a precise find location.
- The verification secret — to anyone but staff and the finder who wrote it.
- The item index to unauthenticated users or crawlers (`noindex` on `/items/*`, auth-gated, `robots.txt` disallow).

### 10.3 Sensitive categories
These categories are flagged `is_sensitive = true`: wallet, purse, ID card, credit/debit card, keys, phone, laptop/tablet, passport, medication, jewelry.

For these items:
- No photo is shown publicly, ever. Staff only.
- The public card shows category + building + date only.
- Claims are **always** staff-mediated. The auto-approve path is disabled in code, not config.
- Pickup is at the Union desk, always.

### 10.4 Retention
- Photos and item records are purged 90 days after an item reaches `collected` or `archived`.
- Lost reports expire after 90 days, with an email offering renewal at day 83.
- Audit log retained 1 year.
- Implement the purge as a scheduled job from day one. Don't leave it as a manual chore.

### 10.5 Abuse
- A claim denied twice by staff flags the account for review.
- Audit log every claim action, every staff override, every item edit, with a hashed IP.
- Simple honeypot field on the anonymous post form to stop bots.

---

## 11. UI/UX direction

**Feel:** calm, fast, obvious. This is campus utility software used in a hurry by a stressed person who lost their keys. It should feel closer to a well-made transit app than to a social network.

**Rules:**
- Mobile-first. Design at 375px, then scale up. Most use is on a phone, standing in a hallway.
- One primary action per screen. On the landing page: "I found something" and "I lost something", nothing else above the fold.
- Thumb-reachable primary buttons — bottom third of the screen on mobile.
- Minimum 44×44px touch targets.
- Photos are the interface. Big, fast-loading, blurhash placeholders while they load. Never a spinner over a grid.
- Empty states are instructions, not apologies. "Nothing matching yet — we'll email you the moment something turns up" beats "No results found."
- Loading: skeletons for content, optimistic updates for actions.
- Every destructive action is confirmable but not nagging.
- **Light and dark mode**, both properly designed — not an inverted hack.

**Type and color:**
- One typeface, 2–3 weights. System font stack is fine and fast; a single well-chosen display face for the landing page is fine too.
- Build a real token set (`--color-*`, `--space-*`, `--radius-*`) in CSS custom properties, redefined under dark mode. Nothing hardcoded in components.
- Don't ship default Tailwind blue-500 everywhere. Pick an actual palette and commit to it. Davidson's red is an option but don't make it look like an official college site if it isn't one yet.

**Accessibility (required, not aspirational):**
- WCAG 2.1 AA contrast minimums throughout, in both themes.
- Full keyboard navigation. Visible focus rings — never `outline: none` without a replacement.
- Semantic HTML before ARIA. Real `<button>`, real `<form>`, real headings in order.
- Every item photo gets a meaningful alt text, auto-generated from category + color + building.
- Form errors announced to screen readers and tied to inputs with `aria-describedby`.
- Respect `prefers-reduced-motion`.

---

## 12. Marketing page and SEO

Be realistic: **the app itself is login-gated and should not be indexed.** SEO effort goes entirely into the public pages.

**Target queries:** "davidson lost and found", "davidson college lost and found", "lost [item] davidson".

**Requirements:**
- `/`, `/about`, `/privacy` are server-rendered, fast, and indexable.
- `/items/*` and everything authenticated: `noindex, nofollow` + `robots.txt` disallow.
- Proper `<title>` and meta description per public page. One `<h1>` per page.
- Open Graph + Twitter card images — this gets shared in GroupMe and group chats, and the preview card matters more than the search ranking.
- JSON-LD: `Organization` and `FAQPage` on `/about`. That's all that's warranted.
- `sitemap.xml` with public routes only.
- Canonical URLs.
- Lighthouse SEO and Accessibility ≥ 95 on public pages.

---

## 13. Performance

- Lighthouse Performance ≥ 90 on mobile for `/` and `/items`.
- LCP < 2.5s on simulated 4G.
- Images: WebP, responsive `srcset`, lazy-loaded below the fold, blurhash placeholder.
- Paginate or infinite-scroll the item grid at 24 per page. Never load the whole table.
- Database indexes on: `items(status, category_id, found_at)`, `items(building_id)`, `items USING gin(search_tsv)`, `lost_reports(status, user_id)`, `matches(lost_report_id)`.
- No N+1 queries. Check the query log before declaring a phase done.

---

## 14. Observability

- Structured JSON logging, no `console.log` in production paths.
- Error tracking (Sentry free tier).
- A `/api/health` endpoint.
- Track four product metrics from day one, in the database: **time-to-post**, **items posted per week**, **match-to-claim rate**, **claim-to-collected rate**. These are what tells you if the thing actually works, and what you'll show the Union and the grant committee.

---

## 15. Testing

- **Unit:** matching scorer, verification logic, permission checks, EXIF stripping. Vitest.
- **Integration:** every API route, including the unauthorized and wrong-role cases. Every endpoint gets a "someone else's data" test that must 403.
- **E2E (Playwright):** the three critical paths — post a found item anonymously, file a lost report and receive a match, claim an item end to end.
- **Accessibility:** axe-core in CI against every public route.
- CI runs lint, typecheck, unit, integration, and a11y on every push. Build fails on any failure.
- Target 80% coverage on `lib/` and `app/api/`. Don't chase coverage on UI components.

---

## 16. Stack

Use this unless you have a specific argument against a piece — if you do, make it before building.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript, strict | One deploy, SSR for SEO pages, API routes |
| Styling | Tailwind + CSS custom property tokens | Fast, and tokens keep theming honest |
| Components | shadcn/ui, customized | Accessible primitives, not a visual identity |
| Database | Postgres (Supabase or Neon) | RLS, full-text search, pgvector all in one |
| Auth | Supabase Auth (magic link) behind an interface | Swap to SSO later without a rewrite |
| Storage | Supabase Storage, private bucket | Signed URLs built in |
| Email | Resend | Simple, generous free tier |
| Validation | Zod, shared client and server | One schema, two uses |
| Hosting | Vercel | Free at pilot scale |
| Embeddings (P4) | CLIP via Replicate, cached in pgvector | Pay per embedding, cache forever |

**This stack costs ~$0 at campus pilot scale.** If you find yourself adding a paid service, flag it to me first — the budget is a $1,000 grant.

---

## 17. Build phases

### Phase 0 — Foundation
Repo, TypeScript strict, lint/format, CI pipeline, Tailwind + design tokens, light/dark theming, database schema + migrations + seed data, RLS policies on every table, auth with magic link, `.env.example`, README.
**Done when:** I can sign in with a Davidson email, CI is green, and the schema is migrated with seed buildings and categories.

### Phase 1 — Post and browse (the MVP that matters)
Anonymous found-item posting with camera capture, server-side image pipeline (EXIF strip, re-encode, WebP, blurhash), browse grid with filters, item detail page, `/me` page, landing page.
**Done when:** a stranger can scan a QR, post a found item in under 15 seconds on a phone, and a signed-in student can find it in the grid.

### Phase 2 — Lost reports and matching
Lost report flow, Tier 0 deterministic matcher, Tier 1 text re-rank, match records, email notifications with batching and one-click dismiss, match list on `/me`.
**Done when:** I file a lost report, someone posts a matching item, and I get one correctly-ranked email within a minute.

### Phase 3 — Claims and staff console
Claim flow with verification secret, honor pledge path, sensitive-category enforcement, staff console, claim review queue, mark-collected, audit log, retention purge job.
**Done when:** the Union desk can run a full day of claims without touching the database.

### Phase 4 — Visual matching (optional)
CLIP embeddings on upload, pgvector storage, Tier 2 re-ranking within Tier 0 candidates only, graceful degradation when the provider fails, cost cap and monitoring.
**Done when:** visual re-ranking measurably improves match ordering on a test set — and the app still works identically with the AI switched off.

---

## 18. Repo structure

```
/app              routes (App Router)
/components       UI components
/lib
  /auth           auth interface + provider impl
  /db             schema, queries, migrations
  /matching       scorer, tiers, notification logic
  /images         upload pipeline, EXIF, blurhash
  /validation     zod schemas, shared
/tests
  /unit /integration /e2e
/public
SPEC.md
DECISIONS.md
README.md
.env.example
```

---

## 19. Open questions — ask me these before you start

1. **Auth:** should you build magic-link now and defer SSO, or wait on Davidson IT? (Default: build magic-link now.)
2. **Supabase or Neon + separate auth?** (Default: Supabase, for RLS + storage + pgvector in one.)
3. Do I have the real list of Davidson building names, or should you seed with placeholders I'll correct?
4. Is there a value threshold for "valuable" beyond the sensitive-category list — e.g. does a nice jacket need staff mediation?
5. Should anonymous finders be able to optionally leave an email to be told when their item found its owner?
6. Is the Union desk the only drop-off point at launch, or are there others?
7. Do you want the Davidson name and branding on it, or should it stay visually independent until the college formally signs off?
