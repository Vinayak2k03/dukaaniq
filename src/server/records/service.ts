import "server-only";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/whatsapp";
import type { CatalogItem, CustomerInput, PersonMatch, ProductInput, SaleInput } from "@/lib/validation/records";
import { billTotals } from "./math";

/**
 * Creating shop records without the workbook (products, customers, sales). Voice and typed forms both call these
 * through the API routes. Callers pass a merchant taken from the user's verified membership, never from the request.
 */

type Merchant = { id: string };
type Actor = { userId: string };
type Created = { ok: true; id: string; duplicate: boolean } | { ok: false; error: string; field?: string; existingId?: string };

const IST_OFFSET_MS = 330 * 60_000;
const money = (paise: number) => (paise / 100).toFixed(2);
const toPaise = (d: { mul(n: number): { toDecimalPlaces(n: number): { toNumber(): number } } }) => d.mul(100).toDecimalPlaces(0).toNumber();
/** Records made in the app carry `app:<idempotency key>` as their external id, so a retried request returns the first record. */
const appKey = (key: string) => `app:${key}`;

export async function listCatalog(merchantId: string): Promise<CatalogItem[]> {
  const rows = await db.product.findMany({ where: { merchantId }, orderBy: { name: "asc" }, take: 2_000, select: { id: true, name: true, category: true, sellingPrice: true, costPrice: true } });
  return rows.map((p) => ({ id: p.id, name: p.name, category: p.category, pricePaise: toPaise(p.sellingPrice), costPaise: toPaise(p.costPrice) }));
}

export async function listPeople(merchantId: string): Promise<PersonMatch[]> {
  return (await db.customer.findMany({ where: { merchantId }, orderBy: { displayName: "asc" }, take: 2_000, select: { id: true, displayName: true, phone: true } })).map((c) => ({ id: c.id, name: c.displayName, phone: c.phone }));
}

export async function createProduct(merchant: Merchant, input: ProductInput): Promise<Created> {
  const replay = await db.product.findUnique({ where: { merchantId_externalId: { merchantId: merchant.id, externalId: appKey(input.idempotencyKey) } }, select: { id: true } });
  if (replay) return { ok: true, id: replay.id, duplicate: true };
  const same = await db.product.findFirst({ where: { merchantId: merchant.id, name: { equals: input.name, mode: "insensitive" } }, select: { id: true, name: true } });
  if (same) return { ok: false, error: `"${same.name}" is already in your products.`, field: "name", existingId: same.id };
  const p = await db.product.create({
    data: { merchantId: merchant.id, externalId: appKey(input.idempotencyKey), name: input.name, category: input.category ?? null, sellingPrice: money(input.sellingPrice), costPrice: money(input.costPrice) },
    select: { id: true },
  });
  return { ok: true, id: p.id, duplicate: false };
}

/** A customer is opted in only when the owner confirmed consent; without it, no real WhatsApp message can be sent (DB trigger). */
export async function createCustomer(merchant: Merchant, input: CustomerInput): Promise<Created> {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const same = await db.customer.findFirst({ where: { merchantId: merchant.id, displayName: { equals: input.name, mode: "insensitive" } }, select: { id: true, displayName: true } });
  if (same) return { ok: false, error: `A customer named "${same.displayName}" already exists.`, field: "name", existingId: same.id };
  if (phone) {
    // Stored numbers come in mixed formats (workbook "+91 90000 00044", typed "9876543210"), so compare them normalized.
    const withPhone = await db.customer.findMany({ where: { merchantId: merchant.id, phone: { not: null } }, select: { id: true, displayName: true, phone: true }, take: 5_000 });
    const owner = withPhone.find((c) => normalizePhone(c.phone) === phone);
    if (owner) return { ok: false, error: `This number already belongs to ${owner.displayName}.`, field: "phone", existingId: owner.id };
  }
  const c = await db.customer.create({
    data: { merchantId: merchant.id, displayName: input.name, phone: phone ? displayPhone(phone) : null, preferredLanguage: input.preferredLanguage, optedInAt: input.consent ? new Date() : null, joinedAt: new Date() },
    select: { id: true },
  });
  return { ok: true, id: c.id, duplicate: false };
}

/** "919876543210" → "+91 98765 43210", the format the workbook uses. */
const displayPhone = (digits: string) => (digits.length === 12 && digits.startsWith("91") ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : `+${digits}`);

/**
 * One bill. Prices are what the owner confirmed on screen; cost comes from the product so profit stays correct.
 * An udhaar sale is stored as a CREDIT sale plus a CREDIT_GIVEN ledger entry in the same transaction, so the
 * customer's balance and the bill can never disagree (PRD 8: every balance is reproducible from ledger events).
 */
export async function recordSale(merchant: Merchant, actor: Actor, input: SaleInput): Promise<Created & { netPaise?: number }> {
  const externalId = appKey(input.idempotencyKey);
  return db.$transaction(
    async (tx) => {
      const replay = await tx.sale.findUnique({ where: { merchantId_externalId: { merchantId: merchant.id, externalId } }, select: { id: true, netAmount: true } });
      if (replay) return { ok: true as const, id: replay.id, duplicate: true, netPaise: toPaise(replay.netAmount) };

      const ids = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({ where: { merchantId: merchant.id, id: { in: ids } }, select: { id: true, name: true, costPrice: true } });
      if (products.length !== ids.length) return { ok: false as const, error: "One of the products was not found. Reload and try again.", field: "items" };
      const cost = new Map(products.map((p) => [p.id, toPaise(p.costPrice)]));
      const names = new Map(products.map((p) => [p.id, p.name]));

      let customerName: string | null = null;
      if (input.customerId) {
        const rows = await tx.$queryRaw<{ displayName: string }[]>`SELECT "displayName" FROM customer WHERE "id" = ${input.customerId} AND "merchantId" = ${merchant.id} FOR UPDATE`;
        if (!rows[0]) return { ok: false as const, error: "Customer not found.", field: "customerId" };
        customerName = rows[0].displayName;
      }

      const bill = billTotals(input.items.map((i) => ({ quantity: i.quantity, unitPaise: i.unitPrice, costPaise: cost.get(i.productId) ?? 0 })), input.discount ?? 0);
      if (bill.netPaise <= 0 && input.payment === "UDHAAR") return { ok: false as const, error: "An udhaar sale needs an amount above ₹0.", field: "items" };

      const now = new Date();
      const payment = input.payment;
      const credit = payment === "UDHAAR";
      const sale = await tx.sale.create({
        data: {
          merchantId: merchant.id,
          externalId,
          customerId: input.customerId ?? null,
          saleDate: now,
          paymentMethod: payment === "UDHAAR" ? "OTHER" : payment,
          paymentStatus: credit ? "CREDIT" : "PAID",
          grossAmount: money(bill.grossPaise),
          discountAmount: money(bill.discountPaise),
          netAmount: money(bill.netPaise),
          discountReason: bill.discountPaise > 0 ? "MERCHANT_DISCOUNT" : "NONE",
          transactionCompletedAt: credit ? null : now,
          items: {
            // merchantId comes from the sale relation (saleId + merchantId), so it is not repeated here.
            create: bill.lines.map((l, i) => ({
              productId: input.items[i].productId,
              quantity: input.items[i].quantity.toFixed(3),
              unitSellingPrice: money(l.unitPaise),
              lineTotal: money(l.lineTotalPaise),
              unitCostPrice: money(l.costPaise),
              lineCost: money(l.lineCostPaise),
            })),
          },
        },
        select: { id: true },
      });

      if (credit && input.customerId) {
        const what = input.items.map((i) => `${i.quantity} x ${names.get(i.productId)}`).join(", ").slice(0, 180);
        const entry = await tx.creditEntry.create({
          data: {
            merchantId: merchant.id,
            customerId: input.customerId,
            type: "CREDIT_GIVEN",
            amount: money(bill.netPaise),
            entryDate: now,
            dueDate: input.dueDate ? new Date(Date.parse(`${input.dueDate}T00:00:00Z`) - IST_OFFSET_MS) : null,
            note: `Sale: ${what}`,
            actorId: actor.userId,
            idempotencyKey: `${externalId}:credit`,
          },
          select: { id: true },
        });
        await tx.auditEvent.create({
          data: { merchantId: merchant.id, actorId: actor.userId, eventType: "CREDIT_GIVEN", entityType: "credit_entry", entityId: entry.id, metadata: { customerId: input.customerId, customerName, amountPaise: bill.netPaise, saleId: sale.id, dueDate: input.dueDate ?? null } },
        });
      }
      return { ok: true as const, id: sale.id, duplicate: false, netPaise: bill.netPaise };
    },
    { timeout: 15_000 },
  );
}
