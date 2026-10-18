import { z } from "zod";

/** Shared by the post form (client hints) and the server action (authoritative). */
export const foundItemSchema = z.object({
  category: z.uuid({ error: "Pick what kind of thing it is." }),
  building: z.uuid({ error: "Pick where you found it." }),
  description: z.string().trim().max(500, "Keep it under 500 characters.").default(""),
  secret: z.string().trim().max(200, "Keep it under 200 characters.").default(""),
  contact: z.union([z.literal(""), z.email("That email doesn't look right.").max(254)]).default(""),
  startedAt: z.coerce.number().int().positive().optional().catch(undefined),
  src: z
    .string()
    .max(32)
    .regex(/^[a-z0-9-]*$/)
    .optional()
    .catch(undefined),
});

export type FoundItemInput = z.infer<typeof foundItemSchema>;

export const browseQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  building: z.uuid().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  cursor: z.string().max(200).optional().catch(undefined),
});

export type BrowseQuery = z.infer<typeof browseQuerySchema>;

export const dropOffSchema = z.object({
  item: z.uuid(),
  token: z.string().min(16).max(64),
  dropOff: z.uuid({ error: "Pick where you'll drop it off." }),
});
