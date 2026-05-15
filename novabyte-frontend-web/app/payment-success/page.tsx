import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Payment Successful",
  description: "Payment success page for NovaByte Technologies service payments."
};

export default function PaymentSuccessPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Payment" title="Payment successful." description="Thank you. Your payment confirmation will be matched with the invoice or approved service request." />
      </main>
      <SiteFooter />
    </>
  );
}
