import { NextResponse } from "next/server";
import { z } from "zod";
import { photoObject } from "@/lib/items";
import { log } from "@/lib/log";
import { photoStorage } from "@/lib/storage";

const params = z.object({
  id: z.uuid(),
  width: z.coerce.number().int().positive().max(4000),
});

/**
 * Serves a stored photo. The database decides whether it may be shown at
 * all (open, non-sensitive item); storage is private, so this is the only
 * way to read one. Short cache so a claimed item's photos stop serving soon.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]/[width]">) {
  const parsed = params.safeParse(await ctx.params);
  if (!parsed.success) return new NextResponse(null, { status: 404 });

  try {
    const obj = await photoObject(parsed.data.id);
    if (!obj || !obj.variants.includes(parsed.data.width)) {
      return new NextResponse(null, { status: 404 });
    }
    const data = await photoStorage().get(`${obj.storage_path}_${parsed.data.width}.webp`);
    if (!data) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(data.length),
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        "Content-Disposition": "inline",
      },
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "photo serve failed");
    return new NextResponse(null, { status: 500 });
  }
}
