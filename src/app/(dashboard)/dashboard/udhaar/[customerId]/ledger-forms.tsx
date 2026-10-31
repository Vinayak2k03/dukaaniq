"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { addCreditAction, correctEntryAction, recordRepaymentAction, type LedgerFormState } from "../actions";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { PAYMENT_METHODS } from "@/lib/validation/credit";

const initial: LedgerFormState = {};
const selectClass =
  "block w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20";

function FormShell({
  title,
  subtitle,
  action,
  children,
  idempotencyKey,
  customerId,
  submitLabel,
}: {
  title: string;
  subtitle?: string;
  action: (prev: LedgerFormState, fd: FormData) => Promise<LedgerFormState>;
  children: (state: LedgerFormState) => ReactNode;
  idempotencyKey: string;
  customerId: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      noValidate
      className="flex flex-col justify-between space-y-3 rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-xs"
    >
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-[#171A23]">{title}</h3>
          {subtitle && <p className="text-[11px] text-[#737B8C] mt-0.5">{subtitle}</p>}
        </div>
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <FormError message={state.error} />
        {state.success ? (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
          >
            {state.success}
          </p>
        ) : null}
        {children(state)}
      </div>
      <div className="pt-2 border-t border-[#F0F2F5]">
        <SubmitButton pendingText="Recording entry...">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

const amountField = (errors?: string[], prefill?: { amount?: string; focus?: boolean }) => (
  <Field
    label="Amount (₹)"
    name="amount"
    inputMode="decimal"
    autoComplete="off"
    required
    errors={errors}
    defaultValue={prefill?.amount}
    autoFocus={prefill?.focus}
  />
);

export function AddCreditForm({
  customerId,
  idempotencyKey,
  today,
  prefill,
}: {
  customerId: string;
  idempotencyKey: string;
  today: string;
  prefill?: { amount?: string; focus?: boolean };
}) {
  return (
    <FormShell
      title="Add Udhaar"
      subtitle="Customer couldn't pay right now"
      action={addCreditAction}
      idempotencyKey={idempotencyKey}
      customerId={customerId}
      submitLabel="Record Udhaar"
    >
      {(s) => (
        <>
          {amountField(s.fieldErrors?.amount, prefill)}
          <Field label="Entry Date (optional)" name="entryDate" type="date" max={today} errors={s.fieldErrors?.entryDate} />
          <Field label="Due Date (optional)" name="dueDate" type="date" errors={s.fieldErrors?.dueDate} />
          <Field label="Memo Note (optional)" name="note" maxLength={200} errors={s.fieldErrors?.note} placeholder="Items taken or bill note" />
        </>
      )}
    </FormShell>
  );
}

export function RepaymentForm({
  customerId,
  idempotencyKey,
  today,
  disabled,
  prefill,
}: {
  customerId: string;
  idempotencyKey: string;
  today: string;
  disabled: boolean;
  prefill?: { amount?: string; focus?: boolean };
}) {
  return (
    <FormShell
      title="Record Repayment Received"
      subtitle="Decreases outstanding balance"
      action={recordRepaymentAction}
      idempotencyKey={idempotencyKey}
      customerId={customerId}
      submitLabel="Record Repayment"
    >
      {(s) => (
        <>
          {disabled ? <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">No outstanding udhaar balance currently due.</p> : null}
          {amountField(s.fieldErrors?.amount, prefill)}
          <div className="space-y-1.5">
            <label htmlFor="paymentMethod" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
              Settlement Method
            </label>
            <select id="paymentMethod" name="paymentMethod" defaultValue="CASH" className={selectClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {s.fieldErrors?.paymentMethod?.[0] ? <p className="text-xs text-rose-600">{s.fieldErrors.paymentMethod[0]}</p> : null}
          </div>
          <Field label="Entry Date (optional)" name="entryDate" type="date" max={today} errors={s.fieldErrors?.entryDate} />
          <Field label="Payment Reference (optional)" name="note" maxLength={200} errors={s.fieldErrors?.note} placeholder="UPI Ref / Cash counter" />
        </>
      )}
    </FormShell>
  );
}

export type CorrectableOption = { id: string; label: string };

export function CorrectionForm({
  customerId,
  idempotencyKey,
  options,
}: {
  customerId: string;
  idempotencyKey: string;
  options: CorrectableOption[];
}) {
  return (
    <FormShell
      title="Append Entry Correction"
      subtitle="History is immutable; offsets error line"
      action={correctEntryAction}
      idempotencyKey={idempotencyKey}
      customerId={customerId}
      submitLabel="Record Correction Line"
    >
      {(s) => (
        <>
          <p className="text-[11px] text-[#737B8C] leading-snug">
            Entries are never deleted. A correction appends an adjustment reversal line.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="targetEntryId" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
              Entry to Correct
            </label>
            <select id="targetEntryId" name="targetEntryId" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                Select target entry
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {s.fieldErrors?.targetEntryId?.[0] ? <p className="text-xs text-rose-600">{s.fieldErrors.targetEntryId[0]}</p> : null}
          </div>
          {amountField(s.fieldErrors?.amount)}
          <Field label="Audit Reason" name="reason" maxLength={200} required errors={s.fieldErrors?.reason} placeholder="e.g. Wrong amount keyed in" />
        </>
      )}
    </FormShell>
  );
}
