import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth/enabled";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = {
  title: "Finish signing in",
  robots: { index: false, follow: false },
};

/**
 * Landing page for the emailed link. It does NOT sign in on GET: corporate
 * link scanners (e.g. Outlook Safe Links) prefetch links and would burn the
 * one-time token. The user presses a button, which POSTs.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  if (!isAuthEnabled()) notFound();
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 py-6">
      <h1 className="text-2xl font-bold">Finish signing in</h1>
      <ConfirmForm tokenHash={tokenHash} type={type} />
    </section>
  );
}
