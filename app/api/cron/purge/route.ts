import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { purgeExpired } from "@/lib/retention";

/** Daily retention job, called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new NextResponse(null, { status: 401 });
  }
  try {
    const result = await purgeExpired();
    log.info(result, "retention purge complete");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "retention purge failed");
    return NextResponse.json({ error: "purge failed" }, { status: 500 });
  }
}
