import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Delivery Policy",
  description: "Delivery policy for NovaByte Technologies digital services including websites, software, mobile interfaces, support, and cloud setup."
};

export default function DeliveryPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Policy"
          title="Digital Delivery Policy"
          description="NovaByte Technologies delivers services digitally through online communication, email, cloud deployments, dashboards, repositories, and project handover links."
        />
        <section className="shell section">
          <article className="panel policyPanel">
            <h2>Delivery Method</h2>
            <p>Digital services are delivered through email, online meetings, hosting dashboards, website links, app builds, admin panels, cloud deployment links, or shared project files.</p>
            <h2>Delivery Timeline</h2>
            <p>Delivery timelines depend on the approved scope. Small updates may be delivered within a few business days, while larger websites, dashboards, or app interfaces may require longer timelines.</p>
            <h2>Customer Review</h2>
            <p>Customers are expected to review delivered work and share feedback within the agreed review period. Delayed feedback may extend the delivery timeline.</p>
            <h2>Handover</h2>
            <p>Final handover may include website URLs, admin credentials, source files where agreed, deployment notes, documentation, or support instructions.</p>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
