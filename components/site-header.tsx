import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/auth/enabled";
import { signOut } from "@/app/actions/auth";

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="border-border bg-surface border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-text flex min-h-11 items-center text-lg font-bold no-underline"
        >
          CatFound
        </Link>
        <nav aria-label="Account">
          {!isAuthEnabled() ? null : user ? (
            <form action={signOut}>
              <button
                type="submit"
                className="text-primary min-h-11 px-2 underline underline-offset-4"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/sign-in" className="flex min-h-11 items-center px-2">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
