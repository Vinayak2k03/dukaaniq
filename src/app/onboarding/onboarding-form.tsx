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
      <Field
        label="Shop / Business Name"
        name="shopName"
        autoComplete="organization"
        placeholder="e.g. Sharma General Store"
        required
        errors={state.fieldErrors?.shopName}
      />

      <div className="space-y-1.5">
        <label htmlFor="businessCategory" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
          Primary Business Category
        </label>
        <select
          id="businessCategory"
          name="businessCategory"
          required
          defaultValue=""
          aria-invalid={catErrors?.length ? true : undefined}
          aria-describedby={catErrors?.length ? "businessCategory-error" : undefined}
          className="block w-full rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-xs font-medium text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
        >
          <option value="" disabled>
            Select a retail category
          </option>
          {BUSINESS_CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {catErrors?.length ? (
          <p id="businessCategory-error" className="text-xs font-medium text-rose-600">
            {catErrors[0]}
          </p>
        ) : null}
      </div>

      <div className="pt-2">
        <SubmitButton pendingText="Setting up your store...">Initialize Dukaan Command Centre</SubmitButton>
      </div>
    </form>
  );
}
