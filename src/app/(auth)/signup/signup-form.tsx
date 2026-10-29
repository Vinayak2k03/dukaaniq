"use client";

import { useActionState } from "react";
import { signUpAction, type FormState } from "../actions";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

const initial: FormState = {};

export function SignupForm() {
  const [state, action] = useActionState(signUpAction, initial);
  const f = state.fieldErrors;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state.error} />
      <Field label="Your name" name="name" autoComplete="name" required errors={f?.name} />
      <Field label="Email" name="email" type="email" autoComplete="email" required errors={f?.email} />
      <Field label="Password (8+ characters)" name="password" type="password" autoComplete="new-password" required errors={f?.password} />
      <Field label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required errors={f?.confirmPassword} />
      <SubmitButton pendingText="Creating account...">Create account</SubmitButton>
    </form>
  );
}
