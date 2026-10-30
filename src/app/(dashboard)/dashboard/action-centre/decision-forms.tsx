"use client";

import { useActionState } from "react";
import { approveAction, alternativeAction, executeAction, generateRemindersAction, recordOutcomeAction, rejectAction, type DecisionState } from "./actions";
import { FormError } from "@/components/ui/form-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { DECLINE_REASONS } from "@/lib/validation/recommendation";

const initial: DecisionState = {};
const field = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30";

function Feedback({ state }: { state: DecisionState }) {
  return (
    <>
      <FormError message={state.error} />
      {state.success ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p> : null}
    </>
  );
}

export function GenerateRemindersForm() {
  const [state, action] = useActionState(generateRemindersAction, initial);
  return (
    <form action={action} className="space-y-2">
      <Feedback state={state} />
      <SubmitButton pendingText="Checking the ledger...">Prepare reminders for overdue customers</SubmitButton>
    </form>
  );
}

export function ApproveForm({ recommendationId, version }: { recommendationId: string; version: number }) {
  const [state, action] = useActionState(approveAction, initial);
  const err = state.fieldErrors?.confirmed?.[0];
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <input type="hidden" name="version" value={version} />
      <Feedback state={state} />
      <div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="confirmed" aria-invalid={err ? true : undefined} aria-describedby={err ? "confirm-error" : undefined} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>I have reviewed the customers, the details and the exact message above, and I approve this version.</span>
        </label>
        {err ? <p id="confirm-error" className="mt-1 text-sm text-red-600">{err}</p> : null}
      </div>
      <SubmitButton pendingText="Approving...">Approve</SubmitButton>
    </form>
  );
}

export function RejectForm({ recommendationId, version }: { recommendationId: string; version: number }) {
  const [state, action] = useActionState(rejectAction, initial);
  const f = state.fieldErrors;
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <input type="hidden" name="version" value={version} />
      <Feedback state={state} />
      <div className="space-y-1.5">
        <label htmlFor="reason" className="block text-sm font-medium text-slate-700">Why are you rejecting it?</label>
        <select id="reason" name="reason" defaultValue="" aria-invalid={f?.reason ? true : undefined} className={field}>
          <option value="" disabled>Choose a reason</option>
          {DECLINE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {f?.reason?.[0] ? <p className="text-sm text-red-600">{f.reason[0]}</p> : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="note" className="block text-sm font-medium text-slate-700">Note (optional)</label>
        <input id="note" name="note" maxLength={300} aria-invalid={f?.note ? true : undefined} className={field} />
        {f?.note?.[0] ? <p className="text-sm text-red-600">{f.note[0]}</p> : null}
      </div>
      <SubmitButton pendingText="Rejecting...">Reject</SubmitButton>
    </form>
  );
}

function SimpleForm({ recommendationId, action, label, pending }: { recommendationId: string; action: (p: DecisionState, fd: FormData) => Promise<DecisionState>; label: string; pending: string }) {
  const [state, formAction] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <Feedback state={state} />
      <SubmitButton pendingText={pending}>{label}</SubmitButton>
    </form>
  );
}

export const ExecuteForm = ({ recommendationId }: { recommendationId: string }) => (
  <SimpleForm recommendationId={recommendationId} action={executeAction} label="Record demo action (nothing is sent)" pending="Recording..." />
);

export const AlternativeForm = ({ recommendationId }: { recommendationId: string }) => (
  <SimpleForm recommendationId={recommendationId} action={alternativeAction} label="Request a revised alternative" pending="Preparing..." />
);

export function OutcomeForm({ recommendationId, customers, demo }: { recommendationId: string; customers: { id: string; name: string }[]; demo: boolean }) {
  const [state, action] = useActionState(recordOutcomeAction, initial);
  const f = state.fieldErrors;
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <Feedback state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="outcome-customer" className="block text-sm font-medium text-slate-700">Customer</label>
          <select id="outcome-customer" name="customerId" defaultValue="" aria-invalid={f?.customerId ? true : undefined} className={field}>
            <option value="" disabled>Choose a customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {f?.customerId?.[0] ? <p className="text-sm text-red-600">{f.customerId[0]}</p> : null}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="outcome-type" className="block text-sm font-medium text-slate-700">What happened</label>
          <select id="outcome-type" name="type" defaultValue="OFFER_REDEEMED" className={field}>
            <option value="OFFER_REDEEMED">Coupon / offer redeemed</option>
            <option value="CUSTOMER_RETURNED">Customer came back to buy</option>
          </select>
          {f?.type?.[0] ? <p className="text-sm text-red-600">{f.type[0]}</p> : null}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="outcome-amount" className="block text-sm font-medium text-slate-700">Purchase amount (₹)</label>
          <input id="outcome-amount" name="amount" type="number" min={0} step="0.01" inputMode="decimal" placeholder="0" aria-invalid={f?.amount ? true : undefined} className={field} />
          {f?.amount?.[0] ? <p className="text-sm text-red-600">{f.amount[0]}</p> : null}
        </div>
      </div>
      <SubmitButton pendingText="Recording...">{demo ? "Record demo outcome" : "Record verified outcome"}</SubmitButton>
    </form>
  );
}
