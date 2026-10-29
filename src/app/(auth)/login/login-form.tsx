"use client";

import { useActionState } from "react";
import { signInAction, type FormState } from "../actions";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

const initial: FormState = {};

export function LoginForm() {
  const [state, action] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field label="Email" name="email" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required errors={state.fieldErrors?.password} />
      <SubmitButton pendingText="Signing in...">Log in</SubmitButton>
    </form>
  );
}
