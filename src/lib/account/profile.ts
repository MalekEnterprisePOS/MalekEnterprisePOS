import { z } from "zod";

/** Digits with optional leading +, spaces, brackets and dashes: "082 123 4567", "+27 82 123 4567", "(011) 555-0100". */
export const PHONE_RE = /^[+(]?[0-9][0-9\s()-]{5,28}[0-9]$/;

/** What every customer must tell us before they can buy. Email comes from their sign-in, never from this form. */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120, "That name is too long."),
  businessName: z.string().trim().min(2, "Enter your shop or business name.").max(160, "That name is too long."),
  phone: z.string().trim().regex(PHONE_RE, "Enter a valid phone number, for example 082 123 4567."),
  address: z.string().trim().max(200, "Keep the address under 200 characters.").optional().default(""),
  country: z.string().trim().max(80).optional().default("South Africa"),
});
export type ProfileInput = z.input<typeof profileSchema>;
export type Profile = z.output<typeof profileSchema>;

export const EMPTY_PROFILE: Profile = { name: "", businessName: "", phone: "", address: "", country: "South Africa" };

export const isProfileComplete = (p: Partial<Profile>): boolean => profileSchema.safeParse({ ...EMPTY_PROFILE, ...p }).success;

/** The first problem in plain words, or null when the details are fine. */
export function profileProblem(p: Partial<Profile>): string | null {
  const r = profileSchema.safeParse({ ...EMPTY_PROFILE, ...p });
  return r.success ? null : (r.error.issues[0]?.message ?? "Check your details.");
}

/** Loose version used for sign-up hints sent before the form is fully validated: keeps only short, trimmed strings. */
export const profileHintSchema = z.object({
  name: z.string().trim().max(120).optional(),
  businessName: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(30).optional(),
}).partial();
