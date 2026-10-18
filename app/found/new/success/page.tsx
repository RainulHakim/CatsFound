import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MapPin } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { verifyItemToken } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { listDropOffPoints } from "@/lib/items";
import { postedItemSummary } from "@/lib/post-item";
import { ClearDraft } from "./clear-draft";
import { DropOffForm } from "./drop-off-form";

export const metadata: Metadata = {
  title: "Posted",
  robots: { index: false, follow: false },
};

function mapLink(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default async function PostedPage({ searchParams }: PageProps<"/found/new/success">) {
  const params = await searchParams;
  const item = typeof params.item === "string" ? params.item : "";
  const token = typeof params.t === "string" ? params.t : "";
  const dropped = typeof params.dropped === "string" ? params.dropped : "";

  const valid =
    /^[0-9a-f-]{36}$/i.test(item) &&
    token.length > 0 &&
    verifyItemToken(item, token, serverEnv().APP_ENCRYPTION_KEY);
  const [summary, points] = valid
    ? await Promise.all([postedItemSummary(item), listDropOffPoints()])
    : [null, []];
  const allowed = summary ? points.filter((p) => !summary.is_sensitive || p.accepts_sensitive) : [];
  const chosen =
    summary && dropped
      ? points.find((p) => p.id === dropped && p.id === summary.drop_off_point_id)
      : undefined;

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <ClearDraft />
      <div className="flex items-start gap-3">
        <CheckCircle2 className="text-success mt-1 size-8 shrink-0" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold">Posted. Thank you!</h1>
          <p className="text-muted">
            {summary ? `Your ${summary.category.toLowerCase()} is now listed. ` : ""}
            The owner can find it in the list.
          </p>
        </div>
      </div>

      {chosen ? (
        <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-lg font-semibold">Drop it at {chosen.name}.</p>
          <p className="text-muted">{chosen.instructions}</p>
          <a
            href={mapLink(chosen.lat, chosen.lng)}
            className="flex min-h-11 items-center gap-2"
            rel="noopener noreferrer"
            target="_blank"
          >
            <MapPin className="size-5" aria-hidden="true" />
            Open in Maps
          </a>
        </div>
      ) : summary && allowed.length > 0 ? (
        <>
          {summary.is_sensitive ? (
            <p className="border-accent bg-surface rounded-md border p-3">
              This is a valuable, so it goes to the <strong>Alvarez Union desk</strong>, where staff
              keep it safe until the owner proves it's theirs.
            </p>
          ) : null}
          <DropOffForm
            item={item}
            token={token}
            points={allowed.map(({ id, name, instructions }) => ({ id, name, instructions }))}
          />
        </>
      ) : (
        <p className="border-border bg-surface rounded-lg border p-4">
          Please drop it at the <strong>Alvarez Union desk</strong>.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/found/new" className={buttonVariants({ variant: "secondary" })}>
          Post another item
        </Link>
        <Link href="/items" className={buttonVariants({ variant: "ghost" })}>
          See all found items
        </Link>
      </div>
    </section>
  );
}
