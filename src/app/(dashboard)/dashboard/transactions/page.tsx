import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDateTimeIST, formatPaise } from "@/lib/money";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { Badge } from "@/components/ui/badge";
import { Panel, EmptyState } from "@/components/dashboard/panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Receipt, Search, Filter, Wallet, ArrowRight, Tag } from "@/components/ui/icons";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod, PaymentStatus, SaleStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Bills" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    method?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to view transactions." />;

  const merchant = membership.merchant;
  const { q, method, status, page } = await searchParams;
  const searchQuery = q?.trim() ?? "";
  const selectedMethod = method ?? "ALL";
  const selectedStatus = status ?? "ALL";
  const currentPage = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const pageSize = 50;

  // Build Prisma where clause
  const where: Prisma.SaleWhereInput = { merchantId: merchant.id };

  if (selectedMethod !== "ALL") {
    where.paymentMethod = selectedMethod as PaymentMethod;
  }

  if (selectedStatus !== "ALL") {
    if (selectedStatus === "PAID" || selectedStatus === "CREDIT" || selectedStatus === "PENDING") {
      where.paymentStatus = selectedStatus as PaymentStatus;
    } else {
      where.status = selectedStatus as SaleStatus;
    }
  }

  if (searchQuery) {
    where.OR = [
      { invoiceNumber: { contains: searchQuery, mode: "insensitive" } },
      { customer: { displayName: { contains: searchQuery, mode: "insensitive" } } },
      { paytmTransactionId: { contains: searchQuery, mode: "insensitive" } },
      { couponCode: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  // Fetch transactions and totals
  const [totalMatching, sales, overallStats] = await Promise.all([
    db.sale.count({ where }),
    db.sale.findMany({
      where,
      orderBy: { saleDate: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, displayName: true } },
        items: {
          select: {
            quantity: true,
            unitSellingPrice: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    db.sale.aggregate({
      where: { merchantId: merchant.id },
      _count: { id: true },
      _sum: { netAmount: true, discountAmount: true, grossAmount: true },
    }),
  ]);

  const totalPages = Math.ceil(totalMatching / pageSize);

  const totalGrossPaise = (overallStats._sum.grossAmount?.mul(100).toDecimalPlaces(0).toNumber() ?? 0);
  const totalNetPaise = (overallStats._sum.netAmount?.mul(100).toDecimalPlaces(0).toNumber() ?? 0);
  const totalDiscountPaise = (overallStats._sum.discountAmount?.mul(100).toDecimalPlaces(0).toNumber() ?? 0);
  const totalCount = overallStats._count.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Bills</h1>
          <p className="mt-1 text-xs text-[#737B8C]">
            Verified ledger of sales, discounts, invoices and multi-channel payment settlements.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant="brand" size="sm">
            {totalCount.toLocaleString("en-IN")} Total Records
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Net Revenue"
          value={formatPaise(totalNetPaise)}
          hint="All completed shop sales"
          icon={<Wallet size={16} />}
        />
        <KpiCard
          label="Total Gross Value"
          value={formatPaise(totalGrossPaise)}
          hint="Pre-discount transaction volume"
          icon={<Receipt size={16} />}
        />
        <KpiCard
          label="Discounts &amp; Vouchers Given"
          value={formatPaise(totalDiscountPaise)}
          hint="Total promotional savings"
          icon={<Tag size={16} />}
        />
        <KpiCard
          label="Total Transactions"
          value={`${totalCount} checkouts`}
          hint="Invoices &amp; receipts in system"
          icon={<Receipt size={16} />}
        />
      </div>

      {/* Filters & Search Bar */}
      <form
        method="get"
        action="/dashboard/transactions"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E4E9] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
      >
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737B8C]" />
            <input
              type="search"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search by invoice #, customer name, coupon..."
              className="w-full rounded-lg border border-[#D0D5DD] bg-white py-1.5 pl-9 pr-3 text-xs text-[#171A23] placeholder:text-[#94A3B8] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
            />
          </div>

          {/* Payment Method Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="method" className="text-xs font-medium text-[#737B8C]">
              Method:
            </label>
            <select
              id="method"
              name="method"
              defaultValue={selectedMethod}
              className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
            >
              <option value="ALL">All Methods</option>
              <option value="UPI">UPI</option>
              <option value="PAYTM">Paytm</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="status" className="text-xs font-medium text-[#737B8C]">
              Status:
            </label>
            <select
              id="status"
              name="status"
              defaultValue={selectedStatus}
              className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">Paid</option>
              <option value="CREDIT">Credit / Udhaar</option>
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] transition-colors cursor-pointer"
        >
          <Filter size={13} />
          <span>Apply</span>
        </button>
      </form>

      {/* Transactions Table */}
      <Panel
        title={`Transactions Ledger (${totalMatching} results)`}
        subtitle={`Showing page ${currentPage} of ${totalPages || 1}`}
      >
        {sales.length === 0 ? (
          <EmptyState
            title="No transactions found"
            message="No records match your search criteria. Clear filters to see all shop checkouts."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                  <th scope="col" className="pb-3 pr-4">Invoice / ID</th>
                  <th scope="col" className="pb-3 pr-4">Timestamp (IST)</th>
                  <th scope="col" className="pb-3 pr-4">Customer</th>
                  <th scope="col" className="pb-3 pr-4">Items Breakdown</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Gross (₹)</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Discount (₹)</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Net Amount</th>
                  <th scope="col" className="pb-3 pr-4">Method</th>
                  <th scope="col" className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5]">
                {sales.map((s) => {
                  const grossPaise = s.grossAmount.mul(100).toDecimalPlaces(0).toNumber();
                  const netPaise = s.netAmount.mul(100).toDecimalPlaces(0).toNumber();
                  const discountPaise = s.discountAmount.mul(100).toDecimalPlaces(0).toNumber();

                  return (
                    <tr key={s.id} className="hover:bg-[#F8F9FB] transition-colors">
                      {/* Invoice # */}
                      <td className="py-3 pr-4 font-mono font-medium text-[#171A23]">
                        {s.invoiceNumber ?? s.id.slice(-8)}
                      </td>

                      {/* Timestamp */}
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-[#525866]">
                        {formatDateTimeIST(s.saleDate)}
                      </td>

                      {/* Customer */}
                      <td className="py-3 pr-4 font-medium text-[#171A23]">
                        {s.customer ? (
                          <Link
                            href={`/dashboard/customers/${s.customer.id}`}
                            className="text-[#4338CA] hover:underline"
                          >
                            {s.customer.displayName}
                          </Link>
                        ) : (
                          <span className="text-[#737B8C]">Walk-in</span>
                        )}
                      </td>

                      {/* Items */}
                      <td className="py-3 pr-4 text-[#525866] max-w-xs truncate">
                        {s.items.length > 0
                          ? s.items.map((i) => `${i.product.name} (x${Number(i.quantity)})`).join(", ")
                          : "General retail items"}
                      </td>

                      {/* Gross Amount */}
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-[#525866]">
                        {formatPaise(grossPaise)}
                      </td>

                      {/* Discount Amount */}
                      <td className="py-3 pr-4 text-right font-mono tabular-nums text-emerald-700">
                        {discountPaise > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span>-{formatPaise(discountPaise)}</span>
                            {s.couponCode && (
                              <span className="rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200">
                                {s.couponCode}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#94A3B8]">&mdash;</span>
                        )}
                      </td>

                      {/* Net Amount */}
                      <td className="py-3 pr-4 text-right font-mono font-semibold text-[#171A23] tabular-nums">
                        {formatPaise(netPaise)}
                      </td>

                      {/* Method */}
                      <td className="py-3 pr-4">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {s.paymentMethod}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            s.paymentStatus === "PAID" && s.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60"
                              : s.paymentStatus === "CREDIT"
                              ? "bg-amber-50 text-amber-900 border border-amber-200/60"
                              : "bg-rose-50 text-rose-800 border border-rose-200/60"
                          }`}
                        >
                          {s.status === "COMPLETED" ? s.paymentStatus : s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-[#F0F2F5] pt-3 text-xs text-[#737B8C]">
            <span>
              Page {currentPage} of {totalPages} ({totalMatching} transactions)
            </span>
            <div className="flex items-center gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/dashboard/transactions?page=${currentPage - 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${selectedMethod !== "ALL" ? `&method=${selectedMethod}` : ""}${selectedStatus !== "ALL" ? `&status=${selectedStatus}` : ""}`}
                  className="rounded border border-[#D0D5DD] bg-white px-2.5 py-1 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA]"
                >
                  &larr; Previous
                </Link>
              )}
              {currentPage < totalPages && (
                <Link
                  href={`/dashboard/transactions?page=${currentPage + 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${selectedMethod !== "ALL" ? `&method=${selectedMethod}` : ""}${selectedStatus !== "ALL" ? `&status=${selectedStatus}` : ""}`}
                  className="rounded border border-[#D0D5DD] bg-white px-2.5 py-1 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA]"
                >
                  Next &rarr;
                </Link>
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

