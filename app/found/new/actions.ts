"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signItemToken, verifyItemToken } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { MAX_PHOTOS } from "@/lib/images/process";
import { log } from "@/lib/log";
import { createFoundItem, PostRejected, setDropOffPoint } from "@/lib/post-item";
import { allow, dbLimiter, LIMITS } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/security/request";
import { dropOffSchema, foundItemSchema } from "@/lib/validation/found-item";

export type PostState = {
  message?: string;
  errors?: Partial<
    Record<"photos" | "category" | "building" | "description" | "secret" | "contact", string>
  >;
};

export async function postFoundItem(_prev: PostState, formData: FormData): Promise<PostState> {
  // Honeypot: humans never see this field. Pretend success, store nothing.
  if (String(formData.get("website") ?? "") !== "") {
    redirect("/found/new/success");
  }

  const parsed = foundItemSchema.safeParse({
    category: formData.get("category") ?? "",
    building: formData.get("building") ?? "",
    description: formData.get("description") ?? "",
    secret: formData.get("secret") ?? "",
    contact: formData.get("contact") ?? "",
    startedAt: formData.get("startedAt") || undefined,
    src: formData.get("src") || undefined,
  });

  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_PHOTOS + 1);

  const errors: PostState["errors"] = {};
  if (files.length === 0) errors.photos = "Add a photo of what you found.";
  if (files.length > MAX_PHOTOS) errors.photos = `Add at most ${MAX_PHOTOS} photos.`;
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<PostState["errors"]>;
      errors[key] ??= issue.message;
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) {
    return { errors, message: "Check the highlighted fields." };
  }

  const env = serverEnv();
  const ip = clientIp(await headers());
  const allowed = await allow(dbLimiter, [
    { key: `post:ip:${hashIp(ip, env.IP_HASH_SALT)}`, limit: LIMITS.postItemPerIp },
  ]);
  if (!allowed) {
    return {
      message:
        "You've posted a lot in the last hour. Take it to the Union desk, or try again later.",
    };
  }

  let itemId: string;
  try {
    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    itemId = await createFoundItem(parsed.data, buffers, { encryptionKey: env.APP_ENCRYPTION_KEY });
  } catch (err) {
    if (err instanceof PostRejected) {
      const d = err.detail;
      return d.kind === "photos"
        ? { errors: { photos: d.message }, message: d.message }
        : { errors: { [d.field]: d.message }, message: d.message };
    }
    log.error({ err: err instanceof Error ? err.message : String(err) }, "post found item failed");
    return { message: "Something went wrong saving your post. Please try again." };
  }

  const token = signItemToken(itemId, env.APP_ENCRYPTION_KEY);
  redirect(`/found/new/success?item=${itemId}&t=${token}`);
}

export type DropOffState = { error?: string; done?: boolean };

export async function chooseDropOff(
  _prev: DropOffState,
  formData: FormData,
): Promise<DropOffState> {
  const parsed = dropOffSchema.safeParse({
    item: formData.get("item"),
    token: formData.get("token"),
    dropOff: formData.get("dropOff"),
  });
  if (!parsed.success) return { error: "Pick where you'll drop it off." };

  const env = serverEnv();
  if (!verifyItemToken(parsed.data.item, parsed.data.token, env.APP_ENCRYPTION_KEY)) {
    return { error: "This link has expired. Your item is posted; drop it at the Union desk." };
  }
  try {
    const ok = await setDropOffPoint(parsed.data.item, parsed.data.dropOff);
    if (!ok)
      return { error: "This link has expired. Your item is posted; drop it at the Union desk." };
  } catch (err) {
    // The DB refuses sensitive items anywhere but the Union desk.
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "drop-off rejected");
    return { error: "Valuables have to go to the Alvarez Union desk." };
  }
  redirect(
    `/found/new/success?item=${parsed.data.item}&t=${parsed.data.token}&dropped=${parsed.data.dropOff}`,
  );
}
