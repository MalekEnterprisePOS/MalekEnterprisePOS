"use client";

import { CreditCard, Lock } from "lucide-react";
import type { Invoice } from "@/types";
import { Button } from "@/components/ui/Button";
import { formatDate, formatZAR } from "@/lib/utils";
import { usePayInvoice } from "./usePay";

/** The big "you owe this, pay it here" card at the top of the account page. Only shown when something is unpaid and online payments are on. */
export function PayNowCard({ invoices }: { invoices: Invoice[] }) {
  const { pay, payingId } = usePayInvoice();
  const unpaid = invoices.filter((i) => i.status === "PENDING" || i.status === "OVERDUE").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = unpaid[0];
  if (!next) return null;
  const overdue = next.status === "OVERDUE";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl3 border p-5 shadow-card ${overdue ? "border-bad/30 bg-bad/5" : "border-accent/40 bg-accent/10"}`}>
      <div className="flex items-center gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-full ${overdue ? "bg-bad/15 text-[#A22B3B]" : "bg-accent/30 text-accent-ink"}`}><CreditCard className="h-6 w-6" aria-hidden /></span>
        <div>
          <p className="font-display text-lg font-bold text-ink-900">{overdue ? "Payment overdue" : "Payment due"}: {formatZAR(next.total)}</p>
          <p className="text-sm text-muted">Invoice {next.number}, {overdue ? "was due" : "due"} {formatDate(next.dueDate)}{unpaid.length > 1 ? ` (+${unpaid.length - 1} more unpaid)` : ""}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Button size="lg" loading={payingId === next.id} onClick={() => pay(next.id)}>Pay {formatZAR(next.total)} now</Button>
        <span className="flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" aria-hidden />Secure card payment by Yoco</span>
      </div>
    </div>
  );
}
