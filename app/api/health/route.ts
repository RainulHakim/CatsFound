import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { log } from "@/lib/log";

/** Liveness + database reachability. Reveals nothing about configuration. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let db: "ok" | "error" = "error";

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      // Not a HEAD request: supabase-js reports no error for a HEAD that 404s.
      const { error, status } = await supabase.from("campuses").select("id").limit(1);
      if (!error && status >= 200 && status < 300) db = "ok";
      else log.error({ err: error?.message, status }, "health: database check failed");
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "health: database unreachable",
      );
    }
  }

  const ok = db === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks: { db }, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
