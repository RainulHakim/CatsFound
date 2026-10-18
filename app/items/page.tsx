import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Search } from "lucide-react";
import { ItemCard } from "@/components/item-card";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { serverEnv } from "@/lib/env";
import { browseItems, listBuildings, listCategories } from "@/lib/items";
import { allow, dbLimiter, LIMITS } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/security/request";
import { browseQuerySchema } from "@/lib/validation/found-item";

export const metadata: Metadata = {
  title: "Found items",
  // SPEC §10.2: the item index is never indexed by crawlers.
  robots: { index: false, follow: false },
};

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  const raw = await searchParams;
  const query = browseQuerySchema.parse({
    q: first(raw.q) || undefined,
    category: first(raw.category) || undefined,
    building: first(raw.building) || undefined,
    from: first(raw.from) || undefined,
    to: first(raw.to) || undefined,
    cursor: first(raw.cursor) || undefined,
  });

  let searchBlocked = false;
  if (query.q) {
    const ip = clientIp(await headers());
    searchBlocked = !(await allow(dbLimiter, [
      { key: `search:ip:${hashIp(ip, serverEnv().IP_HASH_SALT)}`, limit: LIMITS.searchPerUser },
    ]));
  }

  const [categories, buildings, page] = await Promise.all([
    listCategories(),
    listBuildings(),
    browseItems(searchBlocked ? { ...query, q: undefined } : query),
  ]);

  const filtered = Boolean(query.q || query.category || query.building || query.from || query.to);
  const nextParams = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, cursor: page.nextCursor ?? undefined })) {
    if (v) nextParams.set(k, v);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Found on campus</h1>
        <p className="text-muted">
          Newest first. Valuables are listed without photos and kept at the Union desk.
        </p>
      </div>

      <form
        method="get"
        action="/items"
        role="search"
        className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4"
      >
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Search found items
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Search, e.g. blue hydro flask"
            maxLength={100}
            className="border-border-strong bg-surface text-text placeholder:text-muted h-11 min-w-0 flex-1 rounded-md border px-3 text-base"
          />
          <button type="submit" className={buttonVariants({ className: "shrink-0" })}>
            <Search className="size-4" aria-hidden="true" />
            Search
          </button>
        </div>
        <details
          open={Boolean(query.category || query.building || query.from || query.to) || undefined}
        >
          <summary className="text-primary flex min-h-11 cursor-pointer items-center underline underline-offset-4">
            Filter by kind, place or date
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="category" className="text-sm font-semibold">
                Kind
              </label>
              <select
                id="category"
                name="category"
                defaultValue={query.category ?? ""}
                className="border-border-strong bg-surface text-text h-11 rounded-md border px-3"
              >
                <option value="">Any kind</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="building" className="text-sm font-semibold">
                Building
              </label>
              <select
                id="building"
                name="building"
                defaultValue={query.building ?? ""}
                className="border-border-strong bg-surface text-text h-11 rounded-md border px-3"
              >
                <option value="">Anywhere</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="from" className="text-sm font-semibold">
                Found from
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={query.from}
                className="border-border-strong bg-surface text-text h-11 rounded-md border px-3"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="to" className="text-sm font-semibold">
                Found until
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={query.to}
                className="border-border-strong bg-surface text-text h-11 rounded-md border px-3"
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={buttonVariants({ variant: "secondary" })}>
                Apply filters
              </button>
              {filtered ? (
                <Link href="/items" className={buttonVariants({ variant: "ghost" })}>
                  Clear all
                </Link>
              ) : null}
            </div>
          </div>
        </details>
      </form>

      {searchBlocked ? (
        <Notice tone="error">Too many searches in a minute. Showing everything instead.</Notice>
      ) : null}

      {page.items.length === 0 ? (
        <div className="border-border bg-surface flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-lg font-semibold">
            {filtered ? "Nothing matching yet." : "Nothing has been posted yet."}
          </p>
          <p className="text-muted">
            {filtered
              ? "Try fewer filters or different words, or check the Alvarez Union desk in person. New items show up here the moment they're posted."
              : "When someone finds something on campus, it shows up here. Found something yourself?"}
          </p>
          <Link href="/found/new" className={buttonVariants({ variant: "accent" })}>
            Post a found item
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Found items">
          {page.items.map((item, i) => (
            <ItemCard key={item.id} item={item} priority={i < 4 && !query.cursor} />
          ))}
        </ul>
      )}

      {page.nextCursor ? (
        <Link
          href={`/items?${nextParams.toString()}`}
          className={buttonVariants({ variant: "secondary", className: "self-center" })}
        >
          Show older items
        </Link>
      ) : null}
    </section>
  );
}
