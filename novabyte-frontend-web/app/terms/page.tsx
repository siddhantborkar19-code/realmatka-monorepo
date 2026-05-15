import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Terms And Conditions",
  description: "Terms and Conditions for NovaByte Technologies software, website, app, cloud, maintenance, and digital services."
};

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Policy"
          title="Terms And Conditions"
          description="These terms apply to customers using NovaByte Technologies for software development, websites, mobile interfaces, maintenance, cloud support, and digital operations."
        />
        <section className="shell section">
          <article className="panel policyPanel">
            <h2>Service Scope</h2>
            <p>All work is delivered as per the agreed requirement, estimate, invoice, written communication, or project scope shared before service work begins.</p>
            <h2>Customer Responsibility</h2>
            <p>Customers must provide correct information, content, access details, brand assets, and timely feedback required to complete the service.</p>
            <h2>Payments</h2>
            <p>Payments are collected against approved invoices, service estimates, retainers, maintenance fees, or confirmed digital service work.</p>
            <h2>Changes And Revisions</h2>
            <p>Minor revisions may be included depending on the agreed scope. New features, redesigns, or additional work may require a revised estimate.</p>
            <h2>Limitation</h2>
            <p>NovaByte Technologies is not responsible for third-party downtime, payment provider issues, domain registrar problems, hosting provider outages, or customer-side configuration errors.</p>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
