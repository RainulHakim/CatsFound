import type { Theme } from "@/lib/theme";
import { ThemeSwitch } from "./theme-switch";

export function SiteFooter({ theme }: { theme: Theme }) {
  return (
    <footer className="border-border mt-auto border-t">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted text-sm">
          A student-run lost &amp; found for Davidson. Not an official college service.
        </p>
        <ThemeSwitch current={theme} />
      </div>
    </footer>
  );
}
