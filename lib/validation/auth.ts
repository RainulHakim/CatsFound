import { z } from "zod";

/** Mirrors public.is_allowed_email() in the database, which is the real guarantee. */
export const ALLOWED_EMAIL = /^[a-z0-9._-]+@davidson\.edu$/;

export const davidsonEmail = z
  .string({ error: "Enter your Davidson email." })
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .refine((v) => v.length > 0, "Enter your Davidson email.")
  .refine((v) => ALLOWED_EMAIL.test(v), "Use your @davidson.edu email address.");

export const signInRequestSchema = z.object({
  email: davidsonEmail,
  next: z.string().max(512).optional(),
});

export const verifyCodeSchema = z.object({
  email: davidsonEmail,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
  next: z.string().max(512).optional(),
});

export const verifyLinkSchema = z.object({
  token_hash: z
    .string()
    .min(10)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/),
  type: z.literal("email"),
});
