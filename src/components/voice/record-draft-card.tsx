"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SALE_PAYMENTS, SALE_PAYMENT_LABEL, type CatalogItem, type CustomerDraft, type PersonMatch, type ProductDraft, type RecordDraft, type SaleDraft, type SaleDraftLine, type SalePayment } from "@/lib/validation/records";

/**
 * Review card for a product, customer or sale that voice pre-filled (PRD 10.1 "Confirm"). Every field is editable
 * and nothing is written until the owner taps Save; the same API routes back typed entry.
 */

export type Saved = { text: string; link?: { href: string; label: string } };
type Props = { draft: RecordDraft; onSaved: (s: Saved) => void; onCancel: () => void };

const field = "w-full rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs text-[#171A23] focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30";
const label = "block text-[11px] font-medium text-[#525866]";
const rupeeText = (paise?: number) => (paise === undefined ? "" : String(paise / 100));
const toPaise = (s: string) => (/^\d{1,9}(\.\d{1,2})?$/.test(s.trim()) ? Math.round(Number(s) * 100) : null);
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newKey = () => `voice:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}
const errorOf = (d: Record<string, unknown>, fallback: string) => {
  const fe = d.fieldErrors as Record<string, string[] | undefined> | undefined;
  const first = fe ? Object.values(fe).flat().find(Boolean) : undefined;
  return (typeof d.error === "string" && d.error !== "Invalid input" ? d.error : first) ?? fallback;
};

function Shell({ title, children, error, busy, onSave, onCancel, saveLabel = "Save" }: { title: string; children: React.ReactNode; error: string | null; busy: boolean; onSave: () => void; onCancel: () => void; saveLabel?: string }) {
  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold text-[#171A23]">{title}</h4>
        <span className="text-[10px] font-medium text-[#737B8C]">Nothing is saved until you tap {saveLabel}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
      {error ? <p role="alert" className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-800">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={onSave} className="rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3730A3] disabled:opacity-50">
          {busy ? "Saving..." : saveLabel}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-[#D0D5DD] px-3 py-1.5 text-xs font-semibold text-[#525866] hover:bg-[#F8F9FB]">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProductCard({ draft, onSaved, onCancel }: Props & { draft: ProductDraft }) {
  const [name, setName] = useState(draft.name);
  const [category, setCategory] = useState(draft.category ?? "");
  const [selling, setSelling] = useState(rupeeText(draft.sellingPaise));
  const [cost, setCost] = useState(rupeeText(draft.costPaise));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  const sp = toPaise(selling);
  const cp = toPaise(cost);

  async function save() {
    if (sp === null || sp <= 0) return setError("Enter the selling price, like 14 or 14.50.");
    if (cp === null) return setError("Enter the buying price (0 if you do not know it yet).");
    setBusy(true);
    setError(null);
    try {
      const r = await post("/api/products", { name, category, sellingPrice: selling.trim(), costPrice: cost.trim(), idempotencyKey: key.current });
      if (!r.ok) return setError(errorOf(r.data, "Could not save the product."));
      onSaved({ text: `Added ${name.trim()} at ${inr(sp)}${cp > 0 ? ` (you buy at ${inr(cp)})` : ""}.` });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="New product" error={error} busy={busy} onSave={() => void save()} onCancel={onCancel}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1"><span className={label}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} /></label>
        <label className="space-y-1"><span className={label}>Category (optional)</span><input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} placeholder="e.g. Snacks" className={field} /></label>
        <label className="space-y-1"><span className={label}>Selling price (₹)</span><input value={selling} onChange={(e) => setSelling(e.target.value)} inputMode="decimal" className={field} /></label>
        <label className="space-y-1"><span className={label}>Buying price (₹)</span><input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={field} /></label>
      </div>
      {sp !== null && cp !== null && sp > 0 && cp > 0 ? (
        <p className={`text-[11px] ${sp > cp ? "text-emerald-700" : "text-rose-700"}`}>
          {sp > cp ? `Profit ${inr(sp - cp)} on each one.` : "Selling price is not above the buying price: you would lose money on each sale."}
        </p>
      ) : null}
    </Shell>
  );
}

function CustomerCard({ draft, onSaved, onCancel }: Props & { draft: CustomerDraft }) {
  const [name, setName] = useState(draft.name);
  const [phone, setPhone] = useState(draft.phone ?? "");
  const [language, setLanguage] = useState<"HINGLISH" | "HINDI" | "ENGLISH">("HINGLISH");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await post("/api/customers", { name, phone, preferredLanguage: language, consent, idempotencyKey: key.current });
      if (!r.ok) return setError(errorOf(r.data, "Could not save the customer."));
      onSaved({ text: `Added customer ${name.trim()}.`, link: { href: `/dashboard/customers/${String(r.data.customerId)}`, label: "Open customer" } });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="New customer" error={error} busy={busy} onSave={() => void save()} onCancel={onCancel}>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1"><span className={label}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={field} /></label>
        <label className="space-y-1"><span className={label}>Mobile (optional)</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98765 43210" className={field} /></label>
        <label className="space-y-1">
          <span className={label}>Message language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} className={field}>
            <option value="HINGLISH">Hinglish</option>
            <option value="HINDI">हिंदी</option>
            <option value="ENGLISH">English</option>
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 text-[11px] text-[#525866]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#4338CA]" />
        <span>The customer agreed to get WhatsApp messages from the shop. Without this, reminders and offers can never be sent to them.</span>
      </label>
    </Shell>
  );
}

const NEW = "__new";
type Line = { key: string; heard: string; productId: string; quantity: string; unit: string; cost: string; options: CatalogItem[] };

function SaleCard({ draft, onSaved, onCancel }: Props & { draft: SaleDraft }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [people, setPeople] = useState<PersonMatch[]>([]);
  const [lines, setLines] = useState<Line[]>(() => {
    const start: SaleDraftLine[] = draft.lines.length ? draft.lines : [{ heard: "", quantity: 1, options: [] }];
    // A spoken item with no close match starts as "add as new product", so the owner only fills in its buying price.
    return start.map((l, i) => ({ key: `l${i}`, heard: l.heard, productId: l.productId ?? (l.heard && !l.options.length ? NEW : ""), quantity: String(l.quantity), unit: rupeeText(l.unitPaise), cost: "", options: l.options }));
  });
  const [customerId, setCustomerId] = useState(draft.customers.length === 1 ? draft.customers[0].id : draft.customerHeard && !draft.customers.length ? NEW : "");
  const [payment, setPayment] = useState<SalePayment | "">(draft.payment ?? "");
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  useEffect(() => {
    void fetch("/api/products").then((r) => (r.ok ? r.json() : { products: [] })).then((d: { products: CatalogItem[] }) => setCatalog(d.products), () => {});
    void fetch("/api/customers").then((r) => (r.ok ? r.json() : { customers: [] })).then((d: { customers: PersonMatch[] }) => setPeople(d.customers), () => {});
  }, []);

  const byId = useMemo(() => new Map([...catalog, ...lines.flatMap((l) => l.options)].map((p) => [p.id, p])), [catalog, lines]);
  const set = (k: string, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const pick = (l: Line, productId: string) => set(l.key, { productId, unit: productId && productId !== NEW ? rupeeText(byId.get(productId)?.pricePaise) : l.unit });
  const totalPaise = lines.reduce((t, l) => t + Math.round(Number(l.quantity || 0) * (toPaise(l.unit) ?? 0)), 0);
  const mismatch = draft.spokenTotalPaise !== undefined && totalPaise > 0 && draft.spokenTotalPaise !== totalPaise;

  async function save() {
    if (!payment) return setError("Choose how the customer paid.");
    if (payment === "UDHAAR" && !customerId) return setError("Choose the customer for an udhaar sale.");
    for (const l of lines) {
      if (!l.productId) return setError(`Choose the product for "${l.heard || "the empty line"}".`);
      if (!(Number(l.quantity) > 0)) return setError("Every quantity must be more than 0.");
      if (toPaise(l.unit) === null) return setError("Enter a price for every item, like 14 or 14.50.");
      if (l.productId === NEW && (!l.heard.trim() || toPaise(l.cost) === null)) return setError(`Enter the name and buying price for the new product "${l.heard}".`);
    }
    setBusy(true);
    setError(null);
    try {
      // New products and a new customer are created first, each with its own retry-safe key, then the bill.
      const ids: string[] = [];
      for (const [i, l] of lines.entries()) {
        if (l.productId !== NEW) {
          ids.push(l.productId);
          continue;
        }
        const r = await post("/api/products", { name: l.heard.trim(), sellingPrice: l.unit.trim(), costPrice: l.cost.trim(), idempotencyKey: `${key.current}:p${i}` });
        if (!r.ok && typeof r.data.existingId !== "string") return setError(errorOf(r.data, `Could not add "${l.heard}".`));
        ids.push(String(r.data.productId ?? r.data.existingId));
      }
      let buyer = customerId;
      if (customerId === NEW) {
        const r = await post("/api/customers", { name: draft.customerHeard, idempotencyKey: `${key.current}:c` });
        if (!r.ok && typeof r.data.existingId !== "string") return setError(errorOf(r.data, "Could not add the customer."));
        buyer = String(r.data.customerId ?? r.data.existingId);
      }
      const r = await post("/api/sales", {
        items: lines.map((l, i) => ({ productId: ids[i], quantity: Number(l.quantity), unitPrice: l.unit.trim() })),
        customerId: buyer || undefined,
        payment,
        dueDate: payment === "UDHAAR" ? dueDate : undefined,
        idempotencyKey: key.current,
      });
      if (!r.ok) return setError(errorOf(r.data, "Could not save the sale."));
      const who = buyer ? (people.find((p) => p.id === buyer)?.name ?? draft.customers.find((p) => p.id === buyer)?.name ?? draft.customerHeard) : null;
      onSaved({
        text: `Saved a ${inr(Number(r.data.netPaise ?? totalPaise))} sale${who ? ` to ${who}` : ""}${payment === "UDHAAR" ? `, added to their udhaar (due ${dueDate})` : ` paid by ${SALE_PAYMENT_LABEL[payment]}`}.`,
        link: payment === "UDHAAR" && buyer ? { href: `/dashboard/udhaar/${buyer}`, label: "Open ledger" } : { href: "/dashboard/transactions", label: "View transactions" },
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="New sale" error={error} busy={busy} onSave={() => void save()} onCancel={onCancel} saveLabel="Save sale">
      <div className="space-y-2">
        {lines.map((l) => {
          const lineTotal = Math.round(Number(l.quantity || 0) * (toPaise(l.unit) ?? 0));
          const rest = catalog.filter((p) => !l.options.some((o) => o.id === p.id));
          return (
            <div key={l.key} className="rounded-md border border-[#F0F2F5] bg-[#FAFBFD] p-2">
              <div className="grid grid-cols-12 items-end gap-2">
                <label className="col-span-12 space-y-1 sm:col-span-6">
                  <span className={label}>{l.heard ? `Product (you said "${l.heard}")` : "Product"}</span>
                  <select value={l.productId} onChange={(e) => pick(l, e.target.value)} className={field}>
                    <option value="">Choose a product</option>
                    {l.options.length ? (
                      <optgroup label="Closest matches">
                        {l.options.map((p) => <option key={p.id} value={p.id}>{p.name} ({inr(p.pricePaise)})</option>)}
                      </optgroup>
                    ) : null}
                    {l.heard ? <option value={NEW}>+ Add &quot;{l.heard}&quot; as a new product</option> : null}
                    {rest.length ? (
                      <optgroup label="All products">
                        {rest.map((p) => <option key={p.id} value={p.id}>{p.name} ({inr(p.pricePaise)})</option>)}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <label className="col-span-3 space-y-1 sm:col-span-2"><span className={label}>Qty</span><input value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value })} inputMode="decimal" className={field} /></label>
                <label className="col-span-4 space-y-1 sm:col-span-2"><span className={label}>Price (₹)</span><input value={l.unit} onChange={(e) => set(l.key, { unit: e.target.value })} inputMode="decimal" className={field} /></label>
                <div className="col-span-3 pb-1.5 text-right text-xs font-semibold tabular-nums text-[#171A23] sm:col-span-1">{inr(lineTotal)}</div>
                <button type="button" aria-label="Remove item" onClick={() => setLines((all) => all.filter((x) => x.key !== l.key))} disabled={lines.length === 1} className="col-span-2 pb-1.5 text-right text-[11px] font-semibold text-rose-700 hover:underline disabled:opacity-30 sm:col-span-1">
                  Remove
                </button>
              </div>
              {l.productId === NEW ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="space-y-1"><span className={label}>New product name</span><input value={l.heard} onChange={(e) => set(l.key, { heard: e.target.value })} maxLength={80} className={field} /></label>
                  <label className="space-y-1"><span className={label}>You buy it at (₹)</span><input value={l.cost} onChange={(e) => set(l.key, { cost: e.target.value })} inputMode="decimal" placeholder="0 if unknown" className={field} /></label>
                </div>
              ) : null}
            </div>
          );
        })}
        <button type="button" onClick={() => setLines((all) => [...all, { key: `l${Date.now()}`, heard: "", productId: "", quantity: "1", unit: "", cost: "", options: [] }])} className="text-[11px] font-semibold text-[#4338CA] hover:underline">
          + Add another item
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={label}>Customer</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
            <option value="">Walk-in (no customer)</option>
            {draft.customers.length ? (
              <optgroup label={`Matches for "${draft.customerHeard}"`}>
                {draft.customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
              </optgroup>
            ) : null}
            {draft.customerHeard && !draft.customers.length ? <option value={NEW}>+ Add &quot;{draft.customerHeard}&quot; as a new customer</option> : null}
            <optgroup label="All customers">
              {people.filter((p) => !draft.customers.some((c) => c.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Payment</span>
          <select value={payment} onChange={(e) => setPayment(e.target.value as SalePayment | "")} className={field}>
            <option value="">Choose</option>
            {SALE_PAYMENTS.map((p) => <option key={p} value={p}>{SALE_PAYMENT_LABEL[p]}</option>)}
          </select>
        </label>
        {payment === "UDHAAR" ? (
          <label className="space-y-1"><span className={label}>Pay back by</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} /></label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0F2F5] pt-2">
        <span className="text-xs text-[#525866]">Total</span>
        <span className="text-sm font-bold tabular-nums text-[#171A23]">{inr(totalPaise)}</span>
      </div>
      {mismatch ? <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">You said {inr(draft.spokenTotalPaise!)}, but the items add up to {inr(totalPaise)}. Check the prices before saving.</p> : null}
    </Shell>
  );
}

export function RecordDraftCard(props: Props) {
  const { draft } = props;
  if (draft.kind === "PRODUCT") return <ProductCard {...props} draft={draft} />;
  if (draft.kind === "CUSTOMER") return <CustomerCard {...props} draft={draft} />;
  return <SaleCard {...props} draft={draft} />;
}
