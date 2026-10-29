import { z } from "zod";

export const BUSINESS_CATEGORIES = [
  ["KIRANA", "Kirana / General store"],
  ["PHARMACY", "Pharmacy"],
  ["RESTAURANT", "Restaurant / Food"],
  ["APPAREL", "Clothing / Apparel"],
  ["ELECTRONICS", "Electronics"],
  ["SALON", "Salon / Services"],
  ["OTHER", "Other"],
] as const;

export type BusinessCategoryValue = (typeof BUSINESS_CATEGORIES)[number][0];

export const categoryLabel = (value: string) =>
  BUSINESS_CATEGORIES.find(([v]) => v === value)?.[1] ?? value;

export const createMerchantSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(2, "Shop name must be at least 2 characters.")
    .max(80, "Shop name is too long."),
  businessCategory: z.enum(
    BUSINESS_CATEGORIES.map(([v]) => v) as [BusinessCategoryValue, ...BusinessCategoryValue[]],
    { error: "Choose a business category." },
  ),
});
