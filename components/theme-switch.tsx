import { setTheme } from "@/app/actions/theme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSwitch({ current }: { current: Theme }) {
  return (
    <form action={setTheme} className="flex items-center gap-2">
      <span id="theme-label" className="text-muted text-sm">
        Theme
      </span>
      <div
        role="group"
        aria-labelledby="theme-label"
        className="border-border-strong flex rounded-md border"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="submit"
            name="theme"
            value={o.value}
            aria-pressed={current === o.value}
            className={cn(
              "min-h-11 min-w-11 px-3 text-sm first:rounded-l-md last:rounded-r-md",
              current === o.value ? "bg-primary text-on-primary" : "text-text hover:bg-surface-2",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </form>
  );
}
