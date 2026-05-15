import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Billing And Quote Request",
  description: "Request invoices and payment links from NovaByte Technologies for approved software, website, app, cloud, maintenance, and digital service work."
};

const billingSteps = [
  "Customer shares service requirement",
  "NovaByte confirms scope, timeline, and estimate",
  "Invoice or payment link is issued for approved service",
  "Service delivery starts after confirmation as per agreed scope"
];

export default function BillingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Billing"
          title="Invoice-based billing for approved software and digital services."
          description="Payments are collected for confirmed service work such as development, maintenance, hosting support, cloud setup, dashboards, and digital operations."
        />
        <section className="shell section">
          <div className="billingLayout">
            <article className="panel billingPanel">
              <span className="cardKicker">Payment Link Request</span>
              <h2>Use billing only after scope confirmation.</h2>
              <p>
                To request an invoice or payment link, email the service name, amount if already quoted, customer name, phone number, and requirement summary.
              </p>
              <ul className="list">
                <li>Website, app, dashboard, or cloud service invoice</li>
                <li>Maintenance, support, and technical retainer billing</li>
                <li>Domain, hosting, deployment, and online support services</li>
                <li>Digital operations and automation service fees</li>
              </ul>
            </article>
            <article className="panel invoiceCard">
              <h3>Billing Process</h3>
              <div className="processPanel compactProcess">
                {billingSteps.map((step, index) => (
                  <div className="processStep" key={step}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{step}</strong>
                  </div>
                ))}
              </div>
              <a className="button buttonPrimary fullButton" href="mailto:novabytetechnoai@gmail.com?subject=Quote%20And%20Billing%20Request">
                Request Quote
              </a>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
