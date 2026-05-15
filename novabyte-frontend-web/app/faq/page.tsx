import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about NovaByte Technologies project timelines, billing, delivery, maintenance, and support."
};

const faqs = [
  ["How long does a project take?", "Small website updates may take a few business days. Larger websites, dashboards, app interfaces, or integrations are scheduled after scope confirmation."],
  ["How does payment work?", "Payments are collected only against approved invoices, service estimates, maintenance retainers, or confirmed digital service work."],
  ["Do you provide support after delivery?", "Yes. Support can be provided as part of the project scope or through a monthly maintenance plan."],
  ["Can I request changes after delivery?", "Minor revisions may be included if agreed in scope. New features or major redesigns require a revised estimate."],
  ["How are digital services delivered?", "Delivery may happen through website URLs, app builds, cloud links, admin credentials, documentation, email, or online handover."]
];

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="FAQ" title="Common questions about projects, billing, delivery, and support." description="Use this page to understand how NovaByte Technologies handles customer work from requirement to delivery." />
        <section className="shell section">
          <div className="faqList">
            {faqs.map(([question, answer]) => (
              <article className="panel policyPanel" key={question}>
                <h2>{question}</h2>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
