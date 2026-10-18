import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Search } from "lucide-react";
import { ItemCard } from "@/components/item-card";
import { buttonVariants } from "@/components/ui/button";
import { browseItems } from "@/lib/items";

export const metadata: Metadata = {
  title: { absolute: "CatFound — Davidson lost & found" },
  description:
    "Davidson College lost and found. Found something on campus? Post it in 15 seconds, no account. Lost something? See what's been found.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const { items } = await browseItems({});
  const recent = items.slice(0, 4);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex min-h-[calc(100dvh-14rem)] flex-col justify-between gap-8 sm:min-h-0 sm:justify-start sm:py-8">
        <div className="flex flex-col gap-3 pt-4">
          <h1 className="text-4xl leading-tight font-bold sm:text-5xl">
            Davidson lost &amp; found,
            <br />
            in your pocket.
          </h1>
          <p className="text-muted max-w-prose text-lg">
            Found something on campus? Post it in seconds, no account needed. Lost something? See
            everything that's been found.
          </p>
        </div>

        {/* Primary actions sit in the bottom third on phones, where thumbs reach. */}
        <div className="flex flex-col gap-3 sm:max-w-md">
          <Link
            href="/found/new"
            className={buttonVariants({ variant: "accent", size: "lg", block: true })}
          >
            <Camera className="size-5" aria-hidden="true" />I found something
          </Link>
          <Link href="/items" className={buttonVariants({ size: "lg", block: true })}>
            <Search className="size-5" aria-hidden="true" />I lost something
          </Link>
        </div>
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="recent-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="text-xl font-bold">
              Recently found
            </h2>
            <Link href="/items" className="flex min-h-11 items-center">
              See all
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {recent.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-xl font-bold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            ["Snap it", "Found something? Take a photo, pick what it is and where. That's it."],
            ["Drop it off", "Leave it at the Alvarez Union desk, or another drop-off point."],
            ["Get it back", "Owners find it here and pick it up. Valuables are checked by staff."],
          ].map(([title, body], i) => (
            <li
              key={title}
              className="border-border bg-surface flex flex-col gap-1 rounded-lg border p-4"
            >
              <span className="text-muted text-sm font-semibold">Step {i + 1}</span>
              <span className="text-lg font-semibold">{title}</span>
              <span className="text-muted">{body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
