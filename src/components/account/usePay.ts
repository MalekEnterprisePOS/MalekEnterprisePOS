"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { accountFetch } from "@/lib/account-client";

/** Starts an online (Yoco) payment for one of the signed-in customer's invoices and sends them to the secure payment page. */
export function usePayInvoice() {
  const toast = useToast();
  const [payingId, setPayingId] = useState<string | null>(null);
  const pay = async (invoiceId: string) => {
    setPayingId(invoiceId);
    try {
      const { url } = await accountFetch<{ url: string }>("/api/account/pay", { invoiceId });
      window.location.assign(url); // leave the page: keep the button busy until the browser navigates
    } catch (e) {
      setPayingId(null);
      toast.error(e instanceof Error ? e.message : "Couldn't start the payment.");
    }
  };
  return { pay, payingId };
}
