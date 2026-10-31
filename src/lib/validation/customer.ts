import { z } from "zod";
import { normalizePhone } from "@/lib/whatsapp";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const LANGUAGES = [
  ["ENGLISH", "English"],
  ["HINGLISH", "Hinglish"],
  ["HINDI", "Hindi"],
] as const;

export const customerProfileSchema = z.object({
  customerId: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(2, "Name must be at least 2 characters.").max(80, "Name is too long."),
  phone: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(20, "Phone number is too long.")
      .refine((v) => normalizePhone(v) !== null, "Enter a valid mobile number, e.g. 98765 43210.")
      .optional(),
  ),
  preferredLanguage: z.enum(["ENGLISH", "HINGLISH", "HINDI"], { error: "Choose a language." }),
});

export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
