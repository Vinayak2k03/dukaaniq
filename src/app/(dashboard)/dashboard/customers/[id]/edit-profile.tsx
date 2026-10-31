"use client";

import { useActionState, useState } from "react";
import { updateCustomerProfileAction, type ProfileFormState } from "./actions";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { LANGUAGES } from "@/lib/validation/customer";

const initial: ProfileFormState = {};

export function EditProfile({
  customer,
}: {
  customer: { id: string; displayName: string; phone: string | null; preferredLanguage: string };
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateCustomerProfileAction, initial);

  // Close once per successful save (adjusting state while rendering, not in an effect).
  const [handled, setHandled] = useState<ProfileFormState>(initial);
  if (state.success && state !== handled) {
    setHandled(state);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        {state.success && (
          <span role="status" className="text-xs font-semibold text-emerald-700">
            {state.success}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-xs font-semibold text-[#171A23] shadow-xs hover:bg-[#F8F9FA] transition-colors cursor-pointer"
        >
          Edit profile
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="w-full space-y-3 rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-xs sm:w-96">
      <h3 className="text-sm font-bold text-[#171A23]">Edit customer profile</h3>
      <input type="hidden" name="customerId" value={customer.id} />
      <FormError message={state.error} />
      <Field label="Name" name="displayName" defaultValue={customer.displayName} required errors={state.fieldErrors?.displayName} />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        defaultValue={customer.phone ?? ""}
        autoComplete="off"
        hint="Optional"
        errors={state.fieldErrors?.phone}
      />
      <div className="space-y-1.5">
        <label htmlFor="preferredLanguage" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
          Message language
        </label>
        <select
          id="preferredLanguage"
          name="preferredLanguage"
          defaultValue={customer.preferredLanguage}
          className="block w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-sm text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
        >
          {LANGUAGES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {state.fieldErrors?.preferredLanguage?.[0] && <p className="text-xs font-medium text-rose-600">{state.fieldErrors.preferredLanguage[0]}</p>}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[#D0D5DD] bg-white px-4 py-2 text-sm font-medium text-[#525866] hover:bg-[#F8F9FA] cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
