import Link from "next/link";
import type { ItemCard as Item } from "@/lib/items";
import { article, formatFoundDate, photoAlt } from "@/lib/format";
import { CategoryIcon } from "./category-icon";
import { ItemPhoto } from "./item-photo";

export function ItemCard({ item, priority }: { item: Item; priority?: boolean }) {
  const photo = item.photos[0];
  const date = formatFoundDate(item.found_at);

  if (item.is_sensitive) {
    // SPEC §10.3: no photo, no detail — category, building and date only.
    const noun = item.category_name.split(" / ")[0]!.toLowerCase();
    return (
      <li>
        <Link
          href={`/items/${item.id}`}
          className="border-border bg-surface text-text shadow-card hover:border-border-strong flex h-full flex-col gap-3 rounded-lg border p-4 no-underline"
        >
          <div className="bg-surface-2 flex aspect-[4/3] items-center justify-center rounded-md">
            <CategoryIcon name={item.category_icon} className="text-muted size-12" />
          </div>
          <p className="font-semibold">
            {article(noun)} {noun} was found in {item.building_name} on {date}.
          </p>
          <p className="text-muted text-sm">Ask at the Alvarez Union desk.</p>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/items/${item.id}`}
        className="border-border bg-surface text-text shadow-card hover:border-border-strong flex h-full flex-col overflow-hidden rounded-lg border no-underline"
      >
        {photo ? (
          <ItemPhoto
            photo={photo}
            alt={photoAlt(item)}
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 50vw"
            priority={priority}
            className="aspect-[4/3]"
          />
        ) : null}
        <div className="flex flex-col gap-1 p-3">
          <p className="flex items-center gap-1.5 font-semibold">
            <CategoryIcon name={item.category_icon} className="size-4 shrink-0" />
            {item.category_name}
          </p>
          <p className="text-muted text-sm">
            {item.building_name} · {date}
          </p>
          {item.description ? <p className="line-clamp-2 text-sm">{item.description}</p> : null}
        </div>
      </Link>
    </li>
  );
}
