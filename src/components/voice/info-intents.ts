"use client";

import type { IntentResponse, VoiceBarResult } from "./voice-bar";

const AUDIENCE_TEXT = { LOYAL: "loyal customers", INACTIVE: "customers who stopped coming", COOLING: "customers who have not visited in 2 to 4 weeks", ACTIVE: "active customers", ALL: "all customers" } as const;

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Read-only voice intents shared by every page (PRD 10.2). Writes are never done automatically:
 * when the merchant wants to add credit, action buttons are returned with customer details and phone number
 * so they can directly review and click to add the credit in the moment.
 * Returns null when the intent is not one of these.
 */
export async function answerInfoIntent(r: IntentResponse, referenceDate: string): Promise<VoiceBarResult | null> {
  switch (r.intent) {
    case "GET_SALES_SUMMARY": {
      const range = r.params.range ?? "today";
      const q = range === "today" ? `range=custom&from=${referenceDate}&to=${referenceDate}` : `range=${range}`;
      const res = await fetch(`/api/dashboard/summary?${q}`);
      if (!res.ok) return "Could not load sales right now.";
      const d = (await res.json()) as { range: { from: string; to: string }; summary: { netSalesPaise: number; orders: number } };
      return `Sales ${d.range.from === d.range.to ? `on ${d.range.from}` : `from ${d.range.from} to ${d.range.to}`}: ${rupees(d.summary.netSalesPaise)} from ${d.summary.orders} paid orders.`;
    }
    case "GET_INACTIVE_CUSTOMERS": {
      const res = await fetch("/api/customers/inactive");
      if (!res.ok) return "Could not load customers right now.";
      const d = (await res.json()) as { rule: string; customers: { name: string; daysSinceLastPurchase: number }[] };
      if (d.customers.length === 0) return `No inactive customers (${d.rule.toLowerCase()}).`;
      return `${d.customers.length} customers have not bought for over 30 days (${d.rule.toLowerCase()}). Longest away: ${d.customers.slice(0, 5).map((c) => `${c.name} (${c.daysSinceLastPurchase} days)`).join(", ")}.`;
    }
    case "CREATE_OFFER": {
      const { discountPct, audience } = r.params;
      if (!discountPct || !audience) return "Tell me how much discount and for which customers, for example \"25% off for loyal customers\".";
      const who = AUDIENCE_TEXT[audience];
      return {
        text: `Ready to prepare ${discountPct}% off for ${who}. Click below to confirm. It is only a proposal: it keeps your minimum margin, and nothing is sent or created until you approve the exact message in Action Centre.`,
        actions: [{ label: `Prepare ${discountPct}% off for ${who}`, kind: "CREATE_OFFER" as const, customerId: "", customerName: who, amountPaise: 0, discountPct, audience }],
      };
    }
    case "GET_CUSTOMER_BALANCE":
    case "ADD_CREDIT":
    case "RECORD_REPAYMENT":
    case "REQUEST_REMINDER": {
      const matches = r.customers ?? [];
      if (!r.params.customerName) return "Which customer? Please say or type the customer's name.";
      if (matches.length === 0) return `No customer named "${r.params.customerName}" was found.`;

      if (r.intent === "ADD_CREDIT" || r.intent === "RECORD_REPAYMENT" || r.intent === "REQUEST_REMINDER") {
        const kind = r.intent;
        const amountPaise = kind === "REQUEST_REMINDER" ? 0 : (r.params.amountPaise ?? 0);
        const amountStr = amountPaise > 0 ? rupees(amountPaise) : "";
        const verb = {
          ADD_CREDIT: (name: string) => `Add ${amountStr || "credit"} to ${name}`,
          RECORD_REPAYMENT: (name: string) => `Record ${amountStr || "repayment"} from ${name}`,
          REQUEST_REMINDER: (name: string) => `Prepare reminder for ${name}`,
        }[kind];
        const goal = { ADD_CREDIT: `add ${amountStr || "credit"} to`, RECORD_REPAYMENT: `record ${amountStr || "a repayment"} for`, REQUEST_REMINDER: "prepare a payment reminder for" }[kind];
        const actions = matches.map((m) => ({
          label: verb(m.name),
          kind,
          customerId: m.id,
          customerName: m.name,
          phone: m.phone,
          amountPaise,
        }));
        if (matches.length > 1) {
          const list = matches.map((m) => `${m.name} (${m.phone ?? m.customerRef ?? "No phone"})`).join(", ");
          return { text: `Found ${matches.length} customers named "${r.params.customerName}" (${list}). Which account would you like to ${goal}?`, actions };
        }
        const single = matches[0];
        const note = kind === "REQUEST_REMINDER" ? " The reminder is only a proposal: you approve it in Action Centre before anything is sent." : "";
        return { text: `Ready to ${goal} ${single.name} (${single.phone ?? single.customerRef ?? "No phone"}). Click below to confirm.${note}`, actions };
      }

      if (matches.length > 1) {
        const list = matches
          .map((m) => {
            const extra = m.phone ? ` ending in ${m.phone.slice(-4)}` : m.customerRef ? ` (${m.customerRef})` : "";
            return `${m.name}${extra}`;
          })
          .join(", ");
        return `Found ${matches.length} customers named "${r.params.customerName}" (${list}). Please open their Udhaar page to select the right one.`;
      }

      const c = matches[0];
      if (r.intent === "GET_CUSTOMER_BALANCE") {
        const res = await fetch(`/api/credit/customers/${c.id}/ledger`);
        if (!res.ok) return "Could not load the ledger right now.";
        const d = (await res.json()) as { asOf: string; account: { balancePaise: number; overduePaise: number } };
        return `${c.name} owes ${rupees(d.account.balancePaise)} as of ${d.asOf}${d.account.overduePaise > 0 ? `, of which ${rupees(d.account.overduePaise)} is overdue` : ""}.`;
      }
      const amount = r.params.amountPaise ? ` of ${rupees(r.params.amountPaise)}` : "";
      const what = r.intent === "RECORD_REPAYMENT" ? `a repayment${amount}` : "a payment reminder";
      return `To record ${what} for ${c.name}, open their Udhaar page (/dashboard/udhaar/${c.id}) and check the customer and amount before saving. Nothing has been saved by voice.`;
    }
    default:
      return null;
  }
}
