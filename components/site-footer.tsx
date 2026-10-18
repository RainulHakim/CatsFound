import Link from "next/link";
import type { Theme } from "@/lib/theme";
import { ThemeSwitch } from "./theme-switch";

export function SiteFooter({ theme }: { theme: Theme }) {
  return (
    <footer className="border-border mt-auto border-t">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-muted text-sm">
            A student-run lost &amp; found for Davidson. Not an official college service.
          </p>
          <nav aria-label="Footer" className="flex gap-4 text-sm">
            <Link href="/about" className="flex min-h-11 items-center">
              How it works
            </Link>
            <Link href="/privacy" className="flex min-h-11 items-center">
              Privacy
            </Link>
          </nav>
        </div>
        <ThemeSwitch current={theme} />
      </div>
    </footer>
  );
}
