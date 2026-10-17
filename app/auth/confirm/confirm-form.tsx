"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmLink, type ConfirmState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function ConfirmForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmLink, {});

  if (!tokenHash) {
    return (
      <Notice tone="error">
        This sign-in link is incomplete. <Link href="/sign-in">Request a new code</Link>.
      </Notice>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      {state.error ? (
        <Notice tone="error">
          {state.error} <Link href="/sign-in">Get a new code</Link>.
        </Notice>
      ) : null}
      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Signing in…" : "Sign in to CatFound"}
      </Button>
    </form>
  );
}
