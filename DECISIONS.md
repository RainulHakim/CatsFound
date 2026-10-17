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
