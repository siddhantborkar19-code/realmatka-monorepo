import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Refund And Cancellation Policy",
<<<<<<< HEAD
  description: "Refund and cancellation policy for NovaByte Technologies digital services, invoices, maintenance, support, and development work."
=======
  description: "Refund and cancellation policy for NovaByte Technologies account credit, digital services, invoices, maintenance, support, and development work."
>>>>>>> b6b70012fc1bdc9cfcf0efc92014030ceb103364
};

export default function RefundPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main>
<<<<<<< HEAD
        <PageHero eyebrow="Policy" title="Refund And Cancellation Policy" description="This policy explains cancellation and refund handling for approved digital service work, software development, maintenance, and support billing." />
        <section className="shell section">
          <article className="panel policyPanel">
            <h2>Policy Scope</h2>
            <p>This policy applies to NovaByte Technologies services including website development, software development, mobile app UI work, admin dashboards, cloud support, maintenance retainers, consultation, and digital operations support.</p>
=======
        <PageHero eyebrow="Policy" title="Refund And Cancellation Policy" description="This policy explains cancellation and refund handling for approved account credit, digital service work, software development, maintenance, and support billing." />
        <section className="shell section">
          <article className="panel policyPanel">
            <h2>Policy Scope</h2>
            <p>This policy applies to NovaByte Technologies services including account credit, wallet top-up, website development, software development, mobile app UI work, admin dashboards, cloud support, maintenance retainers, consultation, and digital operations support.</p>
            <h2>Account Credit Refunds</h2>
            <p>Account credit or wallet top-up payments may be refunded only if the credit has not been used, transferred, consumed, disputed, or adjusted against any service. Refund requests must include payment reference, amount, customer details, and reason for refund.</p>
>>>>>>> b6b70012fc1bdc9cfcf0efc92014030ceb103364
            <h2>Cancellation Before Work Starts</h2>
            <p>If a customer cancels before work has started, the paid amount may be refunded after deducting payment gateway fees, transaction charges, or administrative charges where applicable. Cancellation requests must be sent by email with the payment reference and service details.</p>
            <h2>After Work Has Started</h2>
            <p>Once development, design, deployment, support, consultation, or maintenance work has started, refunds are evaluated based on completed work, committed resources, time spent, and project scope. Partial refunds may be considered only for the undelivered portion of work, if applicable.</p>
            <h2>Non-Refundable Items</h2>
            <p>Domain purchases, hosting purchases, third-party tools, paid plugins, cloud charges, completed support time, and delivered digital work are generally non-refundable.</p>
            <h2>Maintenance And Subscription Cancellation</h2>
            <p>Monthly maintenance or support retainers can be cancelled for the next billing cycle by emailing us before the renewal date. Amounts already paid for the active billing cycle are non-refundable once support availability or work has started.</p>
            <h2>Duplicate Or Failed Payment</h2>
            <p>If a duplicate payment is received or a failed transaction is later confirmed by the payment provider, the extra amount will be adjusted against the invoice or refunded after verification.</p>
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
