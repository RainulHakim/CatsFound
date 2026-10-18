"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { chooseDropOff, type DropOffState } from "../actions";

type Point = { id: string; name: string; instructions: string };

export function DropOffForm({
  item,
  token,
  points,
}: {
  item: string;
  token: string;
  points: Point[];
}) {
  const [state, action, pending] = useActionState<DropOffState, FormData>(chooseDropOff, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="token" value={token} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">Where will you drop it off?</legend>
        {points.map((p, i) => (
          <label
            key={p.id}
            className={cn(
              "border-border-strong bg-surface has-[:checked]:border-primary has-[:checked]:ring-primary flex min-h-14 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:ring-2",
            )}
          >
            <input
              type="radio"
              name="dropOff"
              value={p.id}
              defaultChecked={i === 0}
              className="accent-primary mt-1 size-5"
            />
            <span>
              <span className="block font-semibold">{p.name}</span>
              <span className="text-muted block text-sm">{p.instructions}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Saving…" : "Confirm drop-off"}
      </Button>
    </form>
  );
}
