import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Test helper for "did the tip help?" and "reapply an earlier tip". Real tips need two weeks to play out; this moves an
 * approval back in time and adds clearly marked fake sales around it, with the lift you choose.
 *
 *   npm run dev:tip-sim -- list    [--shop "Sharma"]
 *   npm run dev:tip-sim -- backdate <recommendationId> [--days-ago 20] [--lift 25] [--orders 6] [--avg 150]
 *   npm run dev:tip-sim -- clean   [--shop "Sharma"]       (removes the fake sales; the approval date stays moved)
 *
 * Only demo shops are touched unless you pass --force. Fake sales have an externalId starting with "sim-tip-".
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { shop: { type: "string" }, "days-ago": { type: "string", default: "20" }, lift: { type: "string", default: "25" }, orders: { type: "string", default: "6" }, avg: { type: "string", default: "150" }, force: { type: "boolean", default: false } },
});
const [command, recId] = positionals;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set (.env).");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;
const ymdOf = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** 12:00 IST on that day, so the sale lands inside the IST day the reports use. */
const noon = (ymd: string) => new Date(`${ymd}T06:30:00Z`);

async function pickMerchant() {
  const merchants = await prisma.merchant.findMany({ where: values.shop ? { shopName: { contains: values.shop, mode: "insensitive" } } : {}, select: { id: true, shopName: true, isDemo: true }, take: 5 });
  if (merchants.length !== 1) throw new Error(`Pass --shop so it matches exactly one shop. Found: ${merchants.map((m) => m.shopName).join(", ") || "none"}.`);
  if (!merchants[0].isDemo && !values.force) throw new Error(`"${merchants[0].shopName}" is not a demo shop. Pass --force only if you are sure (it adds fake sales).`);
  return merchants[0];
}

async function list() {
  const merchant = await pickMerchant();
  const rows = await prisma.approvalDecision.findMany({ where: { merchantId: merchant.id, decision: "APPROVED" }, orderBy: { decidedAt: "desc" }, take: 15, select: { recommendationId: true, decidedAt: true, version: { select: { title: true } } } });
  console.log(`${merchant.shopName}: approved tips (newest first)`);
  for (const r of rows) console.log(`  ${r.recommendationId}  approved ${ymdOf(r.decidedAt)}  ${r.version.title}`);
  if (!rows.length) console.log("  none yet: approve a tip in Growth Tips first.");
}

async function backdate() {
  if (!recId) throw new Error("Usage: backdate <recommendationId>");
  const daysAgo = Number(values["days-ago"]);
  const lift = Number(values.lift);
  const orders = Number(values.orders);
  const avg = Number(values.avg);
  if (![daysAgo, lift, orders, avg].every(Number.isFinite) || daysAgo < 1) throw new Error("days-ago, lift, orders and avg must be numbers (days-ago at least 1).");
  const decision = await prisma.approvalDecision.findFirst({ where: { recommendationId: recId, decision: "APPROVED" }, select: { id: true, merchantId: true, version: { select: { audience: { select: { customerId: true } } } } } });
  if (!decision) throw new Error("No approved tip with that recommendationId. Run `list` first.");
  const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: decision.merchantId }, select: { shopName: true, isDemo: true } });
  if (!merchant.isDemo && !values.force) throw new Error(`"${merchant.shopName}" is not a demo shop. Pass --force only if you are sure.`);

  const today = ymdOf(new Date());
  const approved = addDays(today, -daysAgo);
  await prisma.approvalDecision.update({ where: { id: decision.id }, data: { decidedAt: noon(approved) } });
  await prisma.sale.deleteMany({ where: { merchantId: decision.merchantId, externalId: { startsWith: `sim-tip-${recId}-` } } });

  // The same windows the app compares: after = approval+1 .. min(approval+14, today); before = 7 to 28 days just before approval.
  const afterTo = [addDays(approved, 14), today].sort()[0];
  const afterDays = Math.round((Date.parse(afterTo) - Date.parse(addDays(approved, 1))) / DAY) + 1;
  const beforeDays = Math.min(28, Math.max(7, Math.ceil(afterDays / 7) * 7));
  const days = [
    ...Array.from({ length: beforeDays }, (_, i) => ({ ymd: addDays(approved, -beforeDays + i), n: orders })),
    ...Array.from({ length: afterDays }, (_, i) => ({ ymd: addDays(approved, 1 + i), n: Math.max(0, Math.round(orders * (1 + lift / 100))) })),
  ];
  const audience = decision.version.audience.map((a) => a.customerId);
  const data = days.flatMap(({ ymd, n }) =>
    Array.from({ length: n }, (_, i) => ({
      merchantId: decision.merchantId,
      externalId: `sim-tip-${recId}-${ymd}-${i}`,
      // Every other order goes to a customer the tip was aimed at, so the "targeted customers" row moves too.
      customerId: audience.length && i % 2 === 0 ? audience[(i / 2) % audience.length] : null,
      saleDate: noon(ymd),
      paymentMethod: "CASH" as const,
      paymentStatus: "PAID" as const,
      grossAmount: avg.toFixed(2),
      netAmount: avg.toFixed(2),
    })),
  );
  await prisma.sale.createMany({ data });
  const before = orders * avg;
  const after = Math.round(orders * (1 + lift / 100)) * avg;
  console.log(`${merchant.shopName}: approval moved to ${approved} (${daysAgo} days ago).`);
  console.log(`Added ${data.length} fake sales: ${beforeDays} days before, ${afterDays} days after.`);
  console.log(`Simulated shop sales per day: before ${before}, after ${after} (${lift >= 0 ? "+" : ""}${lift}%), plus whatever real sales exist in those days.`);
  console.log(`Check: /dashboard/campaigns ("Did approved tips help?") and, once ${daysAgo} >= the tip's active days, /dashboard ("Reapply an earlier tip?").`);
}

async function clean() {
  const merchant = await pickMerchant();
  const r = await prisma.sale.deleteMany({ where: { merchantId: merchant.id, externalId: { startsWith: "sim-tip-" } } });
  console.log(`${merchant.shopName}: removed ${r.count} fake sales.`);
}

const run = { list, backdate, clean }[command as "list" | "backdate" | "clean"];
if (!run) throw new Error("Commands: list | backdate <recommendationId> | clean");
run()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
