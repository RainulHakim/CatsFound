import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/privacy", "/found/new"],
        // SPEC §10.2: the item index and everything app-like stays out of search.
        disallow: ["/items", "/found/new/success", "/api/", "/sign-in", "/auth/", "/me"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
