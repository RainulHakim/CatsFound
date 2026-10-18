import "server-only";
import { withActor } from "@/lib/db/sql";

export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  is_sensitive: boolean;
};
export type Building = { id: string; name: string; slug: string; lat: number; lng: number };
export type DropOffPoint = {
  id: string;
  name: string;
  instructions: string;
  accepts_sensitive: boolean;
  lat: number;
  lng: number;
};

export type CardPhoto = {
  id: string;
  width: number;
  height: number;
  blurhash: string;
  variants: number[];
};

export type ItemCard = {
  id: string;
  category_name: string;
  category_slug: string;
  category_icon: string;
  building_name: string;
  drop_off_name: string | null;
  found_at: string;
  created_at: string;
  is_sensitive: boolean;
  description: string | null;
  color_tags: string[];
  photos: CardPhoto[];
};

export type ItemDetail = ItemCard & { drop_off_instructions: string | null };

export async function listCategories(): Promise<Category[]> {
  return withActor({ kind: "anon" }, async (db) => {
    const { rows } = await db.query<Category>(
      "select id, name, slug, icon, is_sensitive from public.categories order by sort_order, name",
    );
    return rows;
  });
}

export async function listBuildings(): Promise<Building[]> {
  return withActor({ kind: "anon" }, async (db) => {
    const { rows } = await db.query<Building>(
      "select id, name, slug, lat, lng from public.buildings where is_active order by name",
    );
    return rows;
  });
}

export async function listDropOffPoints(): Promise<DropOffPoint[]> {
  return withActor({ kind: "anon" }, async (db) => {
    const { rows } = await db.query<DropOffPoint>(
      `select d.id, d.name, d.instructions, d.accepts_sensitive, b.lat, b.lng
       from public.drop_off_points d join public.buildings b on b.id = d.building_id
       where d.is_active order by d.sort_order`,
    );
    return rows;
  });
}

// ---------------------------------------------------------------- browse

export const PAGE_SIZE = 24;

export function encodeCursor(card: Pick<ItemCard, "created_at" | "id">): string {
  return Buffer.from(`${new Date(card.created_at).toISOString()}|${card.id}`).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): { created: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [created, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!created || !id || Number.isNaN(Date.parse(created))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { created, id };
  } catch {
    return null;
  }
}

export async function browseItems(q: {
  q?: string;
  category?: string;
  building?: string;
  from?: string;
  to?: string;
  cursor?: string;
}): Promise<{ items: ItemCard[]; nextCursor: string | null }> {
  const cursor = decodeCursor(q.cursor);
  return withActor({ kind: "anon" }, async (db) => {
    const { rows } = await db.query<ItemCard>(
      `select * from public.browse_items(
         p_category => $1, p_building => $2, p_from => $3, p_to => $4, p_q => $5,
         p_before_created => $6, p_before_id => $7, p_limit => $8)`,
      [
        q.category ?? null,
        q.building ?? null,
        q.from ?? null,
        q.to ?? null,
        q.q || null,
        cursor?.created ?? null,
        cursor?.id ?? null,
        PAGE_SIZE + 1,
      ],
    );
    const items = rows.slice(0, PAGE_SIZE);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null };
  });
}

export async function getItem(id: string): Promise<ItemDetail | null> {
  return withActor({ kind: "anon" }, async (db) => {
    const { rows } = await db.query<ItemDetail>("select * from public.get_item($1)", [id]);
    return rows[0] ?? null;
  });
}

export async function photoObject(
  photoId: string,
): Promise<{ storage_path: string; variants: number[] } | null> {
  return withActor({ kind: "anon" }, async (db) => {
    const { rows } = await db.query<{ storage_path: string; variants: number[] }>(
      "select * from public.photo_object($1)",
      [photoId],
    );
    return rows[0] ?? null;
  });
}
