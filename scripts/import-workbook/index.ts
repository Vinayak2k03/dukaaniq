import "dotenv/config";
import { parseArgs } from "node:util";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { readWorkbook } from "./read";
import { toMoney, toPaise, toQty } from "./schemas";
import { validateWorkbook, type Dataset, type ValidationIssue } from "./validate";

const DEFAULT_FILE = "docs/prd/DukaanIQ_Dataset_V2.xlsx";
const CHUNK = 1000;
const REVENUE_METRIC = "Completed paid sales revenue (INR)";
const COGS_METRIC = "Estimated COGS (INR)";

type Check = { name: string; expected: number; actual: number; money: boolean };

const fmt = (n: number, money: boolean) => (money ? `INR ${(n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : String(n));

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<{ count: number }>) {
  let count = 0;
  for (let i = 0; i < rows.length; i += CHUNK) count += (await insert(rows.slice(i, i + CHUNK))).count;
  return { inserted: count, skipped: rows.length - count };
}

/** Totals computed from the workbook rows alone (integer paise), independent of the database. */
function workbookTotals(ds: Dataset) {
  const paidCompleted = new Set(ds.sales.filter((s) => s.payment_status === "PAID" && s.sale_status === "COMPLETED").map((s) => s.sale_id));
  return {
    revenue: ds.sales.filter((s) => paidCompleted.has(s.sale_id)).reduce((t, s) => t + toPaise(s.net_amount), 0),
    cogs: ds.saleItems.filter((i) => paidCompleted.has(i.sale_id)).reduce((t, i) => t + toPaise(i.line_cost), 0),
    creditGiven: ds.credit.filter((c) => c.entry_type === "CREDIT_GIVEN").reduce((t, c) => t + toPaise(c.amount), 0),
    repaid: ds.credit.filter((c) => c.entry_type === "REPAYMENT_RECEIVED").reduce((t, c) => t + toPaise(c.amount), 0),
  };
}

function workbookChecks(ds: Dataset): Check[] {
  const t = workbookTotals(ds);
  const checks: Check[] = [];
  const stated = (metric: string, actual: number, name: string) => {
    const v = ds.summary.get(metric);
    if (v === undefined) throw new Error(`Business_Summary is missing metric "${metric}"`);
    checks.push({ name, expected: toPaise(v), actual, money: true });
  };
  stated(REVENUE_METRIC, t.revenue, "Paid revenue: workbook rows vs Business_Summary");
  stated(COGS_METRIC, t.cogs, "COGS: workbook rows vs Business_Summary");
  return checks;
}

async function databaseChecks(tx: Prisma.TransactionClient, merchantId: string, ds: Dataset): Promise<Check[]> {
  const t = workbookTotals(ds);
  const one = async (q: Prisma.Sql) => Number((await tx.$queryRaw<{ v: bigint }[]>(q))[0]?.v ?? 0);
  const paid = Prisma.sql`s."merchantId" = ${merchantId} AND s."paymentStatus" = 'PAID' AND s."status" = 'COMPLETED'`;
  const credit = (type: string) =>
    Prisma.sql`SELECT COALESCE(ROUND(SUM("amount") * 100), 0)::bigint AS v FROM credit_entry WHERE "merchantId" = ${merchantId} AND "type"::text = ${type}`;
  const [customers, products, sales, items, entries] = await Promise.all([
    tx.customer.count({ where: { merchantId } }),
    tx.product.count({ where: { merchantId } }),
    tx.sale.count({ where: { merchantId } }),
    tx.saleItem.count({ where: { merchantId } }),
    tx.creditEntry.count({ where: { merchantId } }),
  ]);
  return [
    { name: "Customers: workbook vs database", expected: ds.customers.length, actual: customers, money: false },
    { name: "Products: workbook vs database", expected: ds.products.length, actual: products, money: false },
    { name: "Sales: workbook vs database", expected: ds.sales.length, actual: sales, money: false },
    { name: "Sale items: workbook vs database", expected: ds.saleItems.length, actual: items, money: false },
    { name: "Credit entries: workbook vs database", expected: ds.credit.length, actual: entries, money: false },
    {
      name: "Paid revenue: workbook vs database",
      expected: t.revenue,
      actual: await one(Prisma.sql`SELECT COALESCE(ROUND(SUM(s."netAmount") * 100), 0)::bigint AS v FROM sale s WHERE ${paid}`),
      money: true,
    },
    {
      name: "COGS: workbook vs database",
      expected: t.cogs,
      actual: await one(Prisma.sql`SELECT COALESCE(ROUND(SUM(i."lineCost") * 100), 0)::bigint AS v FROM sale_item i JOIN sale s ON s."id" = i."saleId" WHERE ${paid}`),
      money: true,
    },
    { name: "Credit given: workbook vs database", expected: t.creditGiven, actual: await one(credit("CREDIT_GIVEN")), money: true },
    { name: "Repayments: workbook vs database", expected: t.repaid, actual: await one(credit("REPAYMENT_RECEIVED")), money: true },
  ];
}

function report(checks: Check[]) {
  let ok = true;
  for (const c of checks) {
    const pass = c.expected === c.actual;
    ok &&= pass;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${c.name}: ${fmt(c.actual, c.money)}${pass ? "" : ` (expected ${fmt(c.expected, c.money)})`}`);
  }
  return ok;
}

async function load(tx: Prisma.TransactionClient, ds: Dataset, ownerId: string) {
  const m = ds.merchant;
  const existing = await tx.merchant.findFirst({
    where: { isDemo: true, shopName: m.merchant_name, members: { some: { userId: ownerId, role: "OWNER" } } },
    select: { id: true },
  });
  const merchant =
    existing ??
    (await tx.merchant.create({
      data: {
        shopName: m.merchant_name,
        businessCategory: m.business_type,
        city: m.city,
        state: m.state,
        timezone: m.timezone,
        isDemo: true,
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
      select: { id: true },
    }));
  const merchantId = merchant.id;
  const summary: Record<string, unknown> = { merchantId, merchantCreated: !existing };

  if (ds.policy) {
    const p = ds.policy;
    summary.creditPolicy = await insertChunks([p], (data) =>
      tx.creditPolicy.createMany({
        data: data.map((r) => ({ merchantId, name: r.policy_name, gracePeriodDays: r.grace_period_days, lateFeeAmount: toMoney(r.late_fee_amount_inr), penaltyEnabled: r.penalty_enabled, note: r.policy_note })),
        skipDuplicates: true,
      }),
    );
  }

  summary.customers = await insertChunks(ds.customers, (data) =>
    tx.customer.createMany({
      data: data.map((c) => ({
        merchantId,
        customerRef: c.customer_id,
        displayName: c.customer_name,
        phone: c.phone_number,
        preferredLanguage: c.preferred_language,
        joinedAt: c.joined_date,
        optedInAt: c.opted_in_at,
        optedOutAt: c.opted_out_at,
        isSynthetic: c.is_synthetic,
      })),
      skipDuplicates: true,
    }),
  );
  const customerId = new Map((await tx.customer.findMany({ where: { merchantId }, select: { id: true, customerRef: true } })).map((c) => [c.customerRef, c.id]));

  summary.products = await insertChunks(ds.products, (data) =>
    tx.product.createMany({
      data: data.map((p) => ({ merchantId, externalId: p.product_id, name: p.product_name, category: p.category, sellingPrice: toMoney(p.selling_price), costPrice: toMoney(p.cost_price) })),
      skipDuplicates: true,
    }),
  );
  const productId = new Map((await tx.product.findMany({ where: { merchantId }, select: { id: true, externalId: true } })).map((p) => [p.externalId, p.id]));

  summary.sales = await insertChunks(ds.sales, (data) =>
    tx.sale.createMany({
      data: data.map((s) => ({
        merchantId,
        externalId: s.sale_id,
        customerId: s.customer_id ? customerId.get(s.customer_id) : null,
        saleDate: s.sale_date,
        status: s.sale_status,
        paymentMethod: s.payment_method,
        paymentStatus: s.payment_status,
        grossAmount: toMoney(s.gross_amount),
        discountAmount: toMoney(s.discount_amount),
        netAmount: toMoney(s.net_amount),
        discountReason: s.discount_reason,
        couponCode: s.coupon_code,
        invoiceNumber: s.invoice_number,
        paytmTransactionId: s.paytm_transaction_id,
        transactionCompletedAt: s.transaction_completed_at,
      })),
      skipDuplicates: true,
    }),
  );
  const saleId = new Map((await tx.sale.findMany({ where: { merchantId }, select: { id: true, externalId: true } })).map((s) => [s.externalId, s.id]));

  const need = <K, V>(map: Map<K, V>, key: K, what: string): V => {
    const v = map.get(key);
    if (v === undefined) throw new Error(`Internal error: ${what} ${String(key)} was not found after insert`);
    return v;
  };

  summary.saleItems = await insertChunks(ds.saleItems, (data) =>
    tx.saleItem.createMany({
      data: data.map((i) => ({
        merchantId,
        saleId: need(saleId, i.sale_id, "sale"),
        productId: need(productId, i.product_id, "product"),
        externalId: i.sale_item_id,
        quantity: toQty(i.quantity),
        unitSellingPrice: toMoney(i.unit_selling_price),
        lineDiscount: toMoney(i.line_discount),
        lineTotal: toMoney(i.line_total),
        unitCostPrice: toMoney(i.unit_cost),
        lineCost: toMoney(i.line_cost),
      })),
      skipDuplicates: true,
    }),
  );

  // credit_entry is append-only (DB trigger), so existing rows are skipped, never updated.
  // The "import:" idempotency key prefix marks every row created by this importer.
  summary.creditEntries = await insertChunks(ds.credit, (data) =>
    tx.creditEntry.createMany({
      data: data.map((e) => ({
        merchantId,
        customerId: need(customerId, e.customer_id, "customer"),
        type: e.entry_type,
        amount: toMoney(e.amount),
        entryDate: e.entry_date,
        dueDate: e.due_date,
        paymentMethod: e.payment_method,
        note: e.note,
        reason: e.reason,
        actorId: ownerId,
        idempotencyKey: `import:${e.ledger_entry_id}`,
      })),
      skipDuplicates: true,
    }),
  );
  return { merchantId, summary };
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, file: { type: "string", default: DEFAULT_FILE }, "dry-run": { type: "boolean", default: false } },
  });
  const dryRun = values["dry-run"];
  const file = path.resolve(values.file ?? DEFAULT_FILE);
  if (!dryRun && !values.email) throw new Error("Usage: npm run db:seed -- --email <owner email> [--file <xlsx>] [--dry-run]");

  console.log(`Reading ${file}`);
  const { dataset, issues } = validateWorkbook(await readWorkbook(file));

  const printIssues = (list: ValidationIssue[]) => {
    list.slice(0, 25).forEach((i) => console.log(`  - ${i.sheet}${i.row ? ` row ${i.row}` : ""}: ${i.message}`));
    if (list.length > 25) console.log(`  ... and ${list.length - 25} more`);
  };

  if (!dataset) {
    console.log(`Validation FAILED with ${issues.length} problem(s). Nothing was imported.`);
    printIssues(issues);
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = dryRun || !connectionString ? null : new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (!dryRun && !prisma) throw new Error("DIRECT_URL or DATABASE_URL must be set.");

  try {
    if (dataset) {
      console.log(`Validation passed: ${dataset.customers.length} customers, ${dataset.products.length} products, ${dataset.sales.length} sales, ${dataset.saleItems.length} sale items, ${dataset.credit.length} credit entries.`);
      console.log("Workbook totals:");
      if (!report(workbookChecks(dataset))) throw new Error("Workbook rows do not match the workbook's own Business_Summary; refusing to import.");
    }
    if (dryRun) {
      console.log(dataset ? "Dry run complete. No database changes were made." : "Dry run complete with errors.");
      process.exitCode = dataset ? 0 : 1;
      return;
    }
    if (!prisma) return;

    const target = new URL(connectionString ?? "");
    console.log(`Target database: ${target.hostname}${target.pathname}`);

    const run = await prisma.importRun.create({ data: { sourceLabel: path.basename(file), status: "RUNNING" } });
    const finish = (status: "SUCCEEDED" | "FAILED", extra: { merchantId?: string; summary?: Prisma.InputJsonValue; errors?: Prisma.InputJsonValue }) =>
      prisma.importRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), ...extra } });

    if (!dataset) {
      await finish("FAILED", { errors: issues as unknown as Prisma.InputJsonValue });
      process.exitCode = 1;
      return;
    }

    try {
      const owner = await prisma.user.findUnique({ where: { email: (values.email ?? "").trim().toLowerCase() }, select: { id: true } });
      if (!owner) throw new Error(`No user with email ${values.email}. Sign up in the app first, then re-run.`);

      const result = await prisma.$transaction(
        async (tx) => {
          const loaded = await load(tx, dataset, owner.id);
          console.log("Reconciliation against the database:");
          const checks = await databaseChecks(tx, loaded.merchantId, dataset);
          if (!report(checks)) throw new Error("Reconciliation failed; the whole import was rolled back.");
          return loaded;
        },
        { timeout: 300_000, maxWait: 30_000 },
      );
      await finish("SUCCEEDED", { merchantId: result.merchantId, summary: result.summary as Prisma.InputJsonValue });
      console.log("Import SUCCEEDED:", JSON.stringify(result.summary, null, 2));
    } catch (e) {
      await finish("FAILED", { errors: [{ sheet: "import", row: null, message: e instanceof Error ? e.message : String(e) }] });
      throw e;
    }
  } finally {
    await prisma?.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
