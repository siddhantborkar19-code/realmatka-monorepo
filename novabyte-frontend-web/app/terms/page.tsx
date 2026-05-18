import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Terms And Conditions",
<<<<<<< HEAD
  description: "Terms and Conditions for NovaByte Technologies software, website, app, cloud, maintenance, and digital services."
=======
  description: "Terms and Conditions for NovaByte Technologies account credit, software, website, app, cloud, maintenance, and digital services."
>>>>>>> b6b70012fc1bdc9cfcf0efc92014030ceb103364
};

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Policy"
          title="Terms And Conditions"
<<<<<<< HEAD
          description="These terms apply to customers using NovaByte Technologies for software development, websites, mobile interfaces, maintenance, cloud support, and digital operations."
=======
          description="These terms apply to customers using NovaByte Technologies for account credit, software development, websites, mobile interfaces, maintenance, cloud support, and digital operations."
>>>>>>> b6b70012fc1bdc9cfcf0efc92014030ceb103364
        />
        <section className="shell section">
          <article className="panel policyPanel">
            <h2>Acceptance Of Terms</h2>
            <p>By requesting a quote, making a payment, approving a scope, or using NovaByte Technologies services, the customer agrees to these Terms and Conditions.</p>
            <h2>Service Scope</h2>
            <p>All work is delivered as per the agreed requirement, estimate, invoice, written communication, or project scope shared before service work begins.</p>
            <h2>Customer Responsibility</h2>
            <p>Customers must provide correct information, content, access details, brand assets, and timely feedback required to complete the service.</p>
            <h2>Payments</h2>
<<<<<<< HEAD
            <p>Payments are collected in INR against approved invoices, service estimates, retainers, maintenance fees, consultation fees, or confirmed digital service work. Prices listed on the website are starting prices and final quotes may vary by scope.</p>
=======
            <p>Payments are collected in INR against approved account credit requests, invoices, service estimates, retainers, maintenance fees, consultation fees, or confirmed digital service work. Prices listed on the website are starting prices and final quotes may vary by scope.</p>
            <h2>Account Credit / Wallet Top-up</h2>
            <p>Account credit or wallet top-up payments are accepted only for customer-requested account balance or service balance updates. The customer must use the correct payment amount and reference. Credit may be delayed or held for review if payment details do not match, if payment verification fails, or if the transaction is disputed.</p>
>>>>>>> b6b70012fc1bdc9cfcf0efc92014030ceb103364
            <h2>Changes And Revisions</h2>
            <p>Minor revisions may be included depending on the agreed scope. New features, redesigns, or additional work may require a revised estimate.</p>
            <h2>Delivery</h2>
            <p>Digital service delivery may include source files, deployed pages, design screens, dashboard access, documentation, configuration support, or handover instructions as per the approved scope. Delivery timelines are estimates and may change if requirements, content, approvals, or third-party services are delayed.</p>
            <h2>Intellectual Property</h2>
            <p>After full payment, customer-specific deliverables are handed over as per the agreed scope. NovaByte Technologies may reuse general technical knowledge, internal tools, code patterns, and non-confidential learnings in future work.</p>
            <h2>Third-Party Services</h2>
            <p>Domains, hosting, payment gateways, APIs, cloud platforms, email services, plugins, and other third-party tools are governed by their own terms. Customer is responsible for third-party charges unless otherwise agreed in writing.</p>
            <h2>Support</h2>
            <p>Support is provided during agreed support hours and only for services covered by the invoice, project agreement, or active maintenance plan.</p>
            <h2>Limitation</h2>
            <p>NovaByte Technologies is not responsible for third-party downtime, payment provider issues, domain registrar problems, hosting provider outages, or customer-side configuration errors.</p>
            <h2>Contact</h2>
            <p>For questions about these terms, email novabytetechnoai@gmail.com.</p>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
