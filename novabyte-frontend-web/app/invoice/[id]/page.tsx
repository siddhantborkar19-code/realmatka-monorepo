import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../../site-shell";

export const metadata: Metadata = {
  title: "Invoice Details",
  description: "Invoice detail placeholder for NovaByte Technologies service billing."
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <SiteHeader />
      <main>
        <section className="shell pageHero">
          <span className="eyebrow">Invoice</span>
          <h1>Invoice reference {id}</h1>
          <p className="lead">Invoice payment will be available after gateway approval and invoice verification. For now, email support for billing confirmation.</p>
        </section>
        <section className="shell section">
          <article className="panel infoPanel">
            <h2 className="sectionTitle">Invoice Status</h2>
            <p>This is a placeholder route for future invoice-based payments. Final invoice details will be loaded from a secure backend.</p>
            <a className="button buttonPrimary" href="mailto:novabytetechnoai@gmail.com?subject=Invoice%20Query">Contact Billing Support</a>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
