import type { Metadata } from "next";
import { businessContact, PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Company Registration Details",
  description: "Company registration and business details for NovaByte Technologies including registration status, business objective, and contact information."
};

export default function CompanyRegistrationPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Company Details" title="Business registration details will be updated after approval." description="This page keeps company information clear for customers, payment partners, and service review." />
        <section className="shell section">
          <div className="billingLayout">
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Current Details</h2>
              <div className="invoiceBox">
                <div className="invoiceRow"><span>Business Name</span><strong>NovaByte Technologies</strong></div>
                <div className="invoiceRow"><span>Status</span><strong>Registration in process</strong></div>
                <div className="invoiceRow"><span>Location</span><strong>{businessContact.location}</strong></div>
                <div className="invoiceRow"><span>Official Phone</span><strong>To be updated after registration</strong></div>
                <div className="invoiceRow"><span>Registered Office</span><strong>To be updated after registration</strong></div>
                <div className="invoiceRow"><span>Email</span><strong>{businessContact.email}</strong></div>
                <div className="invoiceRow"><span>CIN</span><strong>To be updated after registration</strong></div>
                <div className="invoiceRow"><span>PAN</span><strong>To be updated after registration</strong></div>
                <div className="invoiceRow"><span>GST</span><strong>To be updated if registered</strong></div>
              </div>
            </article>
            <article className="panel infoPanel">
              <h2 className="sectionTitle">To Be Updated</h2>
              <ul className="list">
                <li>CIN after company registration approval</li>
                <li>PAN details where applicable</li>
                <li>GST details if registration is taken</li>
                <li>Registered office and official support phone</li>
              </ul>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
