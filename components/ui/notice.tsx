import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Inline status message. role=status/alert so screen readers announce it. */
export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-4 py-3",
        tone === "error" && "border-danger text-danger",
        tone === "success" && "border-success text-success",
        tone === "info" && "border-border bg-surface-2 text-text",
        className,
      )}
    >
      {children}
    </div>
  );
}
