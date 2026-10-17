"use client";

import { useActionState } from "react";
import { requestSignIn, verifyCode, type SignInState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function SignInForm({ next }: { next: string }) {
  const [emailState, sendEmail, sending] = useActionState<SignInState, FormData>(requestSignIn, {
    step: "email",
    next,
  });
  const [codeState, sendCode, verifying] = useActionState<SignInState, FormData>(verifyCode, {
    step: "code",
  });

  // Verification sends us back to the email step if the email itself was bad.
  const onCodeStep = emailState.step === "code" && codeState.step !== "email";

  if (!onCodeStep) {
    return (
      <form action={sendEmail} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={emailState.next ?? next} />
        <TextField
          label="Davidson email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={emailState.email}
          placeholder="you@davidson.edu"
          hint="We'll email you a 6-digit code. No password needed."
          error={emailState.fieldError}
        />
        {emailState.error ? <Notice tone="error">{emailState.error}</Notice> : null}
        <Button type="submit" size="lg" block disabled={sending}>
          {sending ? "Sending…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="success">
        Code sent to <strong>{emailState.email}</strong>. It expires in 15 minutes.
      </Notice>
      <form action={sendCode} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="email" value={emailState.email ?? ""} />
        <input type="hidden" name="next" value={emailState.next ?? next} />
        <TextField
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          hint="Or tap the sign-in link in the email."
          error={codeState.fieldError}
        />
        {codeState.error ? <Notice tone="error">{codeState.error}</Notice> : null}
        <Button type="submit" size="lg" block disabled={verifying}>
          {verifying ? "Checking…" : "Sign in"}
        </Button>
      </form>
      <form action={sendEmail}>
        <input type="hidden" name="email" value={emailState.email ?? ""} />
        <input type="hidden" name="next" value={emailState.next ?? next} />
        <Button type="submit" variant="ghost" disabled={sending}>
          Send a new code
        </Button>
      </form>
    </div>
  );
}
