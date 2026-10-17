import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getUser } from "@/lib/auth";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "CatFound — Davidson lost & found", template: "%s · CatFound" },
  description:
    "Found something on Davidson's campus? Post it in seconds. Lost something? Get an email the moment it turns up.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1417" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const user = await getUser();

  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader user={user} />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <SiteFooter theme={theme} />
      </body>
    </html>
  );
}
