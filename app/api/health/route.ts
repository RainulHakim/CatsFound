import { NextResponse } from "next/server";
import { withActor } from "@/lib/db/sql";
import { log } from "@/lib/log";

/** Liveness + database reachability. Reveals nothing about configuration. */
export async function GET() {
  let db: "ok" | "error" = "error";
  try {
    await withActor({ kind: "anon" }, async (client) => {
      // Proves the schema exists and the anon role can read reference data.
      await client.query("select 1 from public.campuses limit 1");
    });
    db = "ok";
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "health: database check failed",
    );
  }

  const ok = db === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks: { db }, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
