"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { THEME_COOKIE, THEMES } from "@/lib/theme";
import { safeNextPath } from "@/lib/security/redirect";

const schema = z.object({ theme: z.enum(THEMES) });

/** Plain form post, so the theme switch works without JavaScript. */
export async function setTheme(formData: FormData) {
  const parsed = schema.safeParse({ theme: formData.get("theme") });
  const store = await cookies();
  if (parsed.success) {
    store.set(THEME_COOKIE, parsed.data.theme, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"),
      maxAge: 365 * 24 * 60 * 60,
    });
  }
  const referer = (await headers()).get("referer");
  let back = "/";
  if (referer) {
    try {
      const url = new URL(referer);
      back = safeNextPath(url.pathname + url.search);
    } catch {
      // fall through to "/"
    }
  }
  redirect(back);
}
