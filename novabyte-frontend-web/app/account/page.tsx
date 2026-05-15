import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Customer Account",
  description: "NovaByte Technologies customer account dashboard for account credit, service balance, invoices, and support."
};

const accountCards = [
  { label: "Available Service Balance", value: "INR 0.00", body: "Balance updates after successful payment verification." },
  { label: "Open Support Requests", value: "0", body: "Support tickets and maintenance requests will appear here." },
  { label: "Payment References", value: "0", body: "Checkout and invoice references are tracked for customers." }
];

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Customer Account"
          title="Service balance and digital account area."
          description="This dashboard is for NovaByte customer account credit, service balance, invoices, support requests, and digital operations records."
        />
        <section className="shell section">
          <div className="grid3">
            {accountCards.map((card) => (
              <article className="panel serviceCard" key={card.label}>
                <span className="projectTag">{card.label}</span>
                <strong>{card.value}</strong>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
          <div className="billingLayout accountActions">
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Add account credit</h2>
              <p>Customers can add account credit for approved service balance, support balance, maintenance work, or recurring digital operations.</p>
              <Link className="button buttonPrimary" href="/account/add-fund">Add Fund</Link>
            </article>
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Daily-use services</h2>
              <ul className="list">
                <li>Support balance for small fixes and troubleshooting</li>
                <li>Maintenance balance for regular updates</li>
                <li>Service balance for approved digital operations</li>
                <li>Invoice/payment reference tracking</li>
              </ul>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
