import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { ItemPhoto } from "@/components/item-photo";
import { article, formatFoundDate, photoAlt } from "@/lib/format";
import { getItem } from "@/lib/items";

export const metadata: Metadata = {
  title: "Found item",
  robots: { index: false, follow: false },
};

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const item = await getItem(id);
  if (!item) notFound();

  const date = formatFoundDate(item.found_at);
  const noun = item.category_name.split(" / ")[0]!.toLowerCase();
  const where = item.is_sensitive
    ? "Alvarez Union desk"
    : (item.drop_off_name ?? "Alvarez Union desk");

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href="/items" className="flex min-h-11 items-center gap-1 self-start">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All found items
      </Link>

      {item.is_sensitive ? (
        <div className="bg-surface-2 flex aspect-[4/3] items-center justify-center rounded-lg">
          <CategoryIcon name={item.category_icon} className="text-muted size-20" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {item.photos.map((p, i) => (
            <ItemPhoto
              key={p.id}
              photo={p}
              alt={i === 0 ? photoAlt(item) : `${photoAlt(item)}, photo ${i + 1}`}
              sizes="(min-width: 672px) 672px, 100vw"
              priority={i === 0}
              className="rounded-lg"
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CategoryIcon name={item.category_icon} className="size-6" />
          {item.is_sensitive ? `${article(noun)} ${noun}` : item.category_name}
        </h1>
        <p className="text-muted">
          Found in {item.building_name} on {date}
        </p>
        {item.description ? <p className="text-lg">{item.description}</p> : null}
      </div>

      <div className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="size-5" aria-hidden="true" />
          Is it yours?
        </h2>
        {item.is_sensitive ? (
          <p>
            It's being kept at the <strong>Alvarez Union desk</strong>. Bring your Davidson ID and
            be ready to describe it. Staff will check it's yours before handing it over.
          </p>
        ) : (
          <p>
            Pick it up at the <strong>{where}</strong>
            {item.drop_off_instructions ? `: ${item.drop_off_instructions}` : "."} Be ready to
            describe it.
          </p>
        )}
      </div>
    </article>
  );
}
