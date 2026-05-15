import type { Metadata } from "next";
import { businessContact, PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Contact NovaByte Technologies",
  description: "Contact NovaByte Technologies for software development, website development, app interface, cloud support, maintenance, and billing queries."
};

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Contact"
          title="Tell us what you want to build, maintain, or improve."
          description="Share your project requirement, service issue, billing query, or maintenance request. Our team will respond with next steps and scope details."
        />
        <section className="shell section">
          <div className="billingLayout">
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Contact Details</h2>
              <div className="invoiceBox">
                <div className="invoiceRow">
                  <span>Email</span>
                  <strong>{businessContact.email}</strong>
                </div>
                <div className="invoiceRow">
                  <span>Location</span>
                  <strong>{businessContact.location}</strong>
                </div>
                <div className="invoiceRow">
                  <span>Support Hours</span>
                  <strong>{businessContact.supportHours}</strong>
                </div>
              </div>
            </article>
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Send Requirement</h2>
              <p>
                Email us your name, phone number, service required, preferred timeline, and any existing website/app link. We will reply with scope, estimate, and billing details.
              </p>
              <a className="button buttonPrimary fullButton" href="mailto:novabytetechnoai@gmail.com?subject=Project%20Requirement%20-%20NovaByte%20Technologies">
                Email Project Requirement
              </a>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
