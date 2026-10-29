"use client";

import { useActionState } from "react";
import { createMerchantAction, type OnboardingState } from "./actions";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { BUSINESS_CATEGORIES } from "@/lib/validation/merchant";

const initial: OnboardingState = {};

export function OnboardingForm() {
  const [state, action] = useActionState(createMerchantAction, initial);
  const catErrors = state.fieldErrors?.businessCategory;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Shop name" name="shopName" autoComplete="organization" required errors={state.fieldErrors?.shopName} />
      <div className="space-y-1.5">
        <label htmlFor="businessCategory" className="block text-sm font-medium text-slate-700">
          Business category
        </label>
        <select
          id="businessCategory"
          name="businessCategory"
          required
          defaultValue=""
          aria-invalid={catErrors?.length ? true : undefined}
          aria-describedby={catErrors?.length ? "businessCategory-error" : undefined}
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30"
        >
          <option value="" disabled>
            Select a category
          </option>
          {BUSINESS_CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {catErrors?.length ? (
          <p id="businessCategory-error" className="text-sm text-red-600">
            {catErrors[0]}
          </p>
        ) : null}
      </div>
      <SubmitButton pendingText="Saving...">Save shop details</SubmitButton>
    </form>
  );
}
