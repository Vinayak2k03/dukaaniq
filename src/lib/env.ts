import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  SARVAM_API_KEY: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().min(1).optional()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
  throw new Error(
    `Invalid or missing environment variables: ${names.join(", ")}. See .env.example.`,
  );
}

export const env = parsed.data;
