"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function formObject(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string"),
  );
}

function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof APIError) {
    const code = (e.body as { code?: string } | undefined)?.code ?? "";
    if (code.startsWith("USER_ALREADY_EXISTS")) return "An account with this email already exists.";
    if (code === "INVALID_EMAIL_OR_PASSWORD") return "Incorrect email or password.";
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") return "Password must be 8 to 128 characters.";
    if (e.statusCode === 429) return "Too many attempts. Please wait a moment and try again.";
  }
  return fallback;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { name, email, password } = parsed.data;
  try {
    await auth.api.signUpEmail({ body: { name, email, password }, headers: await headers() });
  } catch (e) {
    console.error("signUp failed:", e);
    return { error: friendlyError(e, "Could not create your account. Please try again.") };
  }
  redirect("/onboarding");
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (e) {
    console.error("signIn failed:", e);
    return { error: friendlyError(e, "Could not sign you in. Please try again.") };
  }
  redirect("/dashboard");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
