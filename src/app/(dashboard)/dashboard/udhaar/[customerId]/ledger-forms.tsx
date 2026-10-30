"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { addCreditAction, correctEntryAction, recordRepaymentAction, type LedgerFormState } from "../actions";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { PAYMENT_METHODS } from "@/lib/validation/credit";

const initial: LedgerFormState = {};
const selectClass = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30";

function FormShell({ title, action, children, idempotencyKey, customerId, submitLabel }: {
  title: string;
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
    <form ref={ref} action={formAction} noValidate className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <FormError message={state.error} />
      {state.success ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p> : null}
      {children(state)}
      <SubmitButton pendingText="Saving...">{submitLabel}</SubmitButton>
    </form>
  );
}

const amountField = (errors?: string[]) => (
  <Field label="Amount (₹)" name="amount" inputMode="decimal" autoComplete="off" required errors={errors} />
);

export function AddCreditForm({ customerId, idempotencyKey, today }: { customerId: string; idempotencyKey: string; today: string }) {
  return (
    <FormShell title="Add credit (udhaar given)" action={addCreditAction} idempotencyKey={idempotencyKey} customerId={customerId} submitLabel="Add credit">
      {(s) => (
        <>
          {amountField(s.fieldErrors?.amount)}
          <Field label="Date (optional, today if empty)" name="entryDate" type="date" max={today} errors={s.fieldErrors?.entryDate} />
          <Field label="Due date (optional)" name="dueDate" type="date" errors={s.fieldErrors?.dueDate} />
          <Field label="Note (optional)" name="note" maxLength={200} errors={s.fieldErrors?.note} />
        </>
      )}
    </FormShell>
  );
}

export function RepaymentForm({ customerId, idempotencyKey, today, disabled }: { customerId: string; idempotencyKey: string; today: string; disabled: boolean }) {
  return (
    <FormShell title="Record repayment" action={recordRepaymentAction} idempotencyKey={idempotencyKey} customerId={customerId} submitLabel="Record repayment">
      {(s) => (
        <>
          {disabled ? <p className="text-sm text-slate-600">No outstanding balance to repay.</p> : null}
          {amountField(s.fieldErrors?.amount)}
          <div className="space-y-1.5">
            <label htmlFor="paymentMethod" className="block text-sm font-medium text-slate-700">Paid by</label>
            <select id="paymentMethod" name="paymentMethod" defaultValue="CASH" className={selectClass}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {s.fieldErrors?.paymentMethod?.[0] ? <p className="text-sm text-red-600">{s.fieldErrors.paymentMethod[0]}</p> : null}
          </div>
          <Field label="Date (optional, today if empty)" name="entryDate" type="date" max={today} errors={s.fieldErrors?.entryDate} />
          <Field label="Note (optional)" name="note" maxLength={200} errors={s.fieldErrors?.note} />
        </>
      )}
    </FormShell>
  );
}

export type CorrectableOption = { id: string; label: string };

export function CorrectionForm({ customerId, idempotencyKey, options }: { customerId: string; idempotencyKey: string; options: CorrectableOption[] }) {
  return (
    <FormShell title="Correct an entry" action={correctEntryAction} idempotencyKey={idempotencyKey} customerId={customerId} submitLabel="Record correction">
      {(s) => (
        <>
          <p className="text-xs text-slate-500">History is never edited or deleted. A correction adds a new line that undoes part or all of an entry.</p>
          <div className="space-y-1.5">
            <label htmlFor="targetEntryId" className="block text-sm font-medium text-slate-700">Entry to correct</label>
            <select id="targetEntryId" name="targetEntryId" required defaultValue="" className={selectClass}>
              <option value="" disabled>Choose an entry</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {s.fieldErrors?.targetEntryId?.[0] ? <p className="text-sm text-red-600">{s.fieldErrors.targetEntryId[0]}</p> : null}
          </div>
          {amountField(s.fieldErrors?.amount)}
          <Field label="Reason" name="reason" maxLength={200} required errors={s.fieldErrors?.reason} />
        </>
      )}
    </FormShell>
  );
}
