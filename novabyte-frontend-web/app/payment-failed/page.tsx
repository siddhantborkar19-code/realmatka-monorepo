import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Payment Failed",
  description: "Payment failed or cancelled page for NovaByte Technologies service payments."
};

export default function PaymentFailedPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Payment" title="Payment could not be completed." description="If money was deducted, please wait for the bank or payment provider refund timeline. Contact support with your reference details." />
        <section className="shell section">
          <article className="panel infoPanel">
            <a className="button buttonPrimary" href="mailto:novabytetechnoai@gmail.com?subject=Payment%20Failed%20Support">Contact Payment Support</a>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
