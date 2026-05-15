import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Refund And Cancellation Policy",
  description: "Refund and cancellation policy for NovaByte Technologies digital services, invoices, maintenance, support, and development work."
};

export default function RefundPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Policy"
          title="Refund And Cancellation Policy"
          description="This policy explains cancellation and refund handling for approved digital service work, software development, maintenance, and support billing."
        />
        <section className="shell section">
          <article className="panel policyPanel">
            <h2>Cancellation Before Work Starts</h2>
            <p>If a customer cancels before work has started, the paid amount may be refunded after deducting payment gateway fees or administrative charges where applicable.</p>
            <h2>After Work Has Started</h2>
            <p>Once development, design, deployment, support, or maintenance work has started, refunds are evaluated based on completed work, committed resources, and project scope.</p>
            <h2>Non-Refundable Items</h2>
            <p>Domain purchases, hosting purchases, third-party tools, paid plugins, cloud charges, completed support time, and delivered digital work are generally non-refundable.</p>
            <h2>Refund Timeline</h2>
            <p>Approved refunds are processed to the original payment method where possible. Bank or gateway processing may take 5 to 10 business days.</p>
            <h2>Contact</h2>
            <p>For refund or cancellation requests, email novabytetechnoai@gmail.com with invoice details and payment reference.</p>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
