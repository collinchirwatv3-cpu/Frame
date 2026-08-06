import { z } from "zod";

/**
 * Mirrors the DB constraints added in
 * supabase/migrations/20260808000000_profile_self_edit.sql exactly — this is
 * UX validation (fast, friendly feedback in EditProfileModal), the
 * constraints are the real boundary. Keep the two in sync if either changes.
 */
export const profileEditSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "3-24 characters: lowercase letters, numbers, underscore"),
  displayName: z.string().trim().min(1, "Required").max(50, "Too long"),
  bio: z.string().trim().max(280, "Too long"),
  website: z
    .string()
    .trim()
    .max(120, "Too long")
    .optional()
    .or(z.literal("")),
  statement: z.string().trim().max(500, "Too long").optional().or(z.literal("")),
  equipment: z.array(z.string().trim().min(1).max(40)).max(12, "Up to 12 items"),
  availableForHire: z.boolean(),
});

export type ProfileEditInput = z.infer<typeof profileEditSchema>;

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
