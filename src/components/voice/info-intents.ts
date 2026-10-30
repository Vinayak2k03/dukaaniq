"use client";

import type { IntentResponse } from "./voice-bar";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Read-only voice intents shared by every page (PRD 10.2). Writes are never done here: credit intents only point to
 * the customer's ledger, where the merchant reviews the customer, amount and method before saving.
 * Returns null when the intent is not one of these.
 */
export async function answerInfoIntent(r: IntentResponse, referenceDate: string): Promise<string | null> {
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
    case "GET_CUSTOMER_BALANCE":
    case "ADD_CREDIT":
    case "RECORD_REPAYMENT":
    case "REQUEST_REMINDER": {
      const matches = r.customers ?? [];
      if (!r.params.customerName) return "Which customer? Please say or type the customer's name.";
      if (matches.length === 0) return `No customer named "${r.params.customerName}" was found.`;
      if (matches.length > 1) return `Several customers match "${r.params.customerName}": ${matches.map((m) => m.name).join(", ")}. Please say the full name.`;
      const c = matches[0];
      if (r.intent === "GET_CUSTOMER_BALANCE") {
        const res = await fetch(`/api/credit/customers/${c.id}/ledger`);
        if (!res.ok) return "Could not load the ledger right now.";
        const d = (await res.json()) as { asOf: string; account: { balancePaise: number; overduePaise: number } };
        return `${c.name} owes ${rupees(d.account.balancePaise)} as of ${d.asOf}${d.account.overduePaise > 0 ? `, of which ${rupees(d.account.overduePaise)} is overdue` : ""}.`;
      }
      const amount = r.params.amountPaise ? ` of ${rupees(r.params.amountPaise)}` : "";
      const what = r.intent === "ADD_CREDIT" ? `credit${amount}` : r.intent === "RECORD_REPAYMENT" ? `a repayment${amount}` : "a payment reminder";
      return `To record ${what} for ${c.name}, open their Udhaar page (/dashboard/udhaar/${c.id}) and check the customer and amount before saving. Nothing has been saved by voice.`;
    }
    default:
      return null;
  }
}
