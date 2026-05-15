import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Payment Request",
  description: "Payment request page placeholder for NovaByte Technologies approved invoices and digital service billing."
};

export default function PayPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Payment" title="Secure payment page coming soon." description="This page will be enabled after payment gateway approval. Payments will be accepted only for approved invoices and confirmed digital service work." />
        <section className="shell section">
          <article className="panel infoPanel">
            <h2 className="sectionTitle">Need a payment link?</h2>
            <p>Email your invoice request or service requirement. Our team will share billing details after scope confirmation.</p>
            <a className="button buttonPrimary" href="mailto:novabytetechnoai@gmail.com?subject=Payment%20Link%20Request">Request Quote / Payment Link</a>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
