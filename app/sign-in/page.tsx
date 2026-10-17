import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/security/redirect";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  if (await getUser()) redirect(next);

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 py-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <SignInForm next={next} />
    </section>
  );
}
