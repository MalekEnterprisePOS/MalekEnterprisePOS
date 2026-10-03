import type { Metadata } from "next";
import { LoginView } from "@/components/account/LoginView";
import { PageBand } from "@/components/marketing/PageBand";

export const metadata: Metadata = { title: "Sign in", description: "Sign in or create your Malek Enterprise POS account.", robots: { index: false } };

export default function LoginPage() {
  return (
    <>
      <PageBand title="Sign in" lede="One account for your licence, invoices, payments and downloads." />
      <div className="bg-paper py-12"><div className="mx-auto max-w-6xl px-5"><LoginView /></div></div>
    </>
  );
}
