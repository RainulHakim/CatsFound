import Link from "next/link";
import { getUser } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/auth/enabled";
import { buttonVariants } from "@/components/ui/button";

export default async function HomePage() {
  const user = await getUser();

  return (
    <section className="flex flex-col gap-6 py-8">
      <h1 className="text-3xl font-bold">Davidson lost &amp; found</h1>
      {!isAuthEnabled() ? (
        <p className="text-muted max-w-prose text-lg">
          A student-run lost &amp; found for Davidson, launching with the Alvarez Union desk.
        </p>
      ) : user ? (
        <p className="text-lg">
          Signed in as <strong>{user.email}</strong>.
        </p>
      ) : (
        <>
          <p className="text-muted max-w-prose text-lg">
            Sign in with your Davidson email to get started.
          </p>
          <Link href="/sign-in" className={buttonVariants({ size: "lg", className: "self-start" })}>
            Sign in
          </Link>
        </>
      )}
    </section>
  );
}
