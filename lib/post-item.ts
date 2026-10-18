import "server-only";
import { randomUUID } from "node:crypto";
import { encrypt } from "@/lib/crypto";
import { withActor } from "@/lib/db/sql";
import { ImageRejected, MAX_PHOTOS, processImage, type ProcessedImage } from "@/lib/images/process";
import { log } from "@/lib/log";
import { photoStorage } from "@/lib/storage";
import type { FoundItemInput } from "@/lib/validation/found-item";

export type PostError =
  | { kind: "photos"; message: string }
  | { kind: "field"; field: "category" | "building"; message: string };

export class PostRejected extends Error {
  constructor(public readonly detail: PostError) {
    super(detail.message);
  }
}

const PHOTO_MESSAGES: Record<ImageRejected["reason"], string> = {
  too_large: "One of the photos is too large. Try again with a smaller photo.",
  not_an_image: "One of the files isn't a photo we can use.",
  unreadable: "We couldn't read one of the photos. Try taking it again.",
};

/**
 * Creates a found item from an anonymous (or later, signed-in) finder.
 * Runs as the service actor: the caller has already validated input,
 * checked the honeypot and applied rate limits.
 */
export async function createFoundItem(
  input: FoundItemInput,
  photos: Buffer[],
  opts: { encryptionKey: string; postedBy?: string | null; now?: number },
): Promise<string> {
  if (photos.length === 0) {
    throw new PostRejected({ kind: "photos", message: "Add at least one photo." });
  }
  if (photos.length > MAX_PHOTOS) {
    throw new PostRejected({ kind: "photos", message: `Add at most ${MAX_PHOTOS} photos.` });
  }

  let processed: ProcessedImage[];
  try {
    processed = await Promise.all(photos.map((p) => processImage(p)));
  } catch (err) {
    if (err instanceof ImageRejected) {
      throw new PostRejected({ kind: "photos", message: PHOTO_MESSAGES[err.reason] });
    }
    throw err;
  }

  const itemId = randomUUID();
  const storage = photoStorage();
  const photoRows = processed.map((img, i) => ({
    id: randomUUID(),
    path: `items/${itemId}/${randomUUID()}`,
    img,
    sort: i,
  }));
  const objectKeys = photoRows.flatMap((p) =>
    p.img.variants.map((v) => `${p.path}_${v.width}.webp`),
  );

  await Promise.all(
    photoRows.flatMap((p) =>
      p.img.variants.map((v) => storage.put(`${p.path}_${v.width}.webp`, v.data, "image/webp")),
    ),
  );

  try {
    await withActor({ kind: "service" }, async (db) => {
      const ref = await db.query<{ category: boolean; building: boolean }>(
        `select exists(select 1 from public.categories where id = $1) as category,
                exists(select 1 from public.buildings where id = $2 and is_active) as building`,
        [input.category, input.building],
      );
      if (!ref.rows[0]?.category) {
        throw new PostRejected({
          kind: "field",
          field: "category",
          message: "Pick what kind of thing it is.",
        });
      }
      if (!ref.rows[0]?.building) {
        throw new PostRejected({
          kind: "field",
          field: "building",
          message: "Pick where you found it.",
        });
      }

      await db.query(
        `insert into public.items (id, category_id, building_id, description)
         values ($1, $2, $3, $4)`,
        [itemId, input.category, input.building, input.description],
      );
      await db.query(
        `insert into public.item_private (item_id, posted_by, verification_secret_enc, posted_by_contact_enc)
         values ($1, $2, $3, $4)`,
        [
          itemId,
          opts.postedBy ?? null,
          input.secret ? encrypt(input.secret, opts.encryptionKey) : null,
          input.contact ? encrypt(input.contact, opts.encryptionKey) : null,
        ],
      );
      for (const p of photoRows) {
        await db.query(
          `insert into public.item_photos (id, item_id, storage_path, variants, width, height, blurhash, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            p.id,
            itemId,
            p.path,
            p.img.variants.map((v) => v.width),
            p.img.width,
            p.img.height,
            p.img.blurhash,
            p.sort,
          ],
        );
      }

      const now = opts.now ?? Date.now();
      const elapsed = input.startedAt ? now - input.startedAt : null;
      // Ignore clock skew and abandoned-tab outliers; keep the honest middle.
      if (elapsed !== null && elapsed > 0 && elapsed < 30 * 60 * 1000) {
        await db.query(
          `insert into public.metrics_events (name, value, item_id, metadata)
           values ('time_to_post', $1, $2, $3)`,
          [elapsed, itemId, JSON.stringify({ src: input.src ?? null, photos: photos.length })],
        );
      }
    });
  } catch (err) {
    await storage
      .del(objectKeys)
      .catch((e) => log.error({ err: String(e) }, "orphaned photo cleanup failed"));
    throw err;
  }

  return itemId;
}

/** Finder chooses where they'll leave it. Sensitive items are forced to the Union by a DB trigger. */
export async function setDropOffPoint(itemId: string, dropOffId: string): Promise<boolean> {
  return withActor({ kind: "service" }, async (db) => {
    const { rowCount } = await db.query(
      `update public.items set drop_off_point_id = $2
       where id = $1 and status = 'open' and created_at > now() - interval '2 hours'`,
      [itemId, dropOffId],
    );
    return rowCount === 1;
  });
}

export async function postedItemSummary(itemId: string): Promise<{
  category: string;
  is_sensitive: boolean;
  drop_off_point_id: string | null;
  building_id: string;
} | null> {
  return withActor({ kind: "service" }, async (db) => {
    const { rows } = await db.query(
      `select c.name as category, i.is_sensitive, i.drop_off_point_id, i.building_id
       from public.items i join public.categories c on c.id = i.category_id
       where i.id = $1 and i.status = 'open' and i.created_at > now() - interval '2 hours'`,
      [itemId],
    );
    return rows[0] ?? null;
  });
}
