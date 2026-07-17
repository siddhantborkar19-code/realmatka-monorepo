import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Pay For Services",
  description: "Payment page for NovaByte Technologies approved invoices, account credit, and digital service billing."
};

export default function PayPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Payment" title="Pay for approved NovaByte services." description="Payments are accepted only for approved invoices, confirmed service work, account credit, support balance, and digital service billing." />
        <section className="shell section">
          <article className="panel infoPanel">
            <h2 className="sectionTitle">Choose checkout after your amount is approved.</h2>
            <p>Use checkout for approved websites, software, dashboards, maintenance, hosting support, consultation, or service credit payments.</p>
            <div className="actions">
              <a className="button buttonPrimary" href="/checkout">Open Checkout</a>
              <a className="button buttonSecondary" href="mailto:novabytetechnoai@gmail.com?subject=Payment%20Link%20Request">Request Quote / Payment Link</a>
            </div>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
