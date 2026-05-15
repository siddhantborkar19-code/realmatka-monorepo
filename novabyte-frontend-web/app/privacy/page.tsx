import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for NovaByte Technologies covering customer data, service communication, billing information, and support records."
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Policy"
          title="Privacy Policy"
          description="This policy explains how NovaByte Technologies handles information shared for software, website, app, cloud, billing, and support services."
        />
        <section className="shell section">
          <article className="panel policyPanel">
            <h2>Information We Collect</h2>
            <p>We may collect customer name, email, phone number, business details, service requirements, invoice details, support messages, and project communication records.</p>
            <h2>How We Use Information</h2>
            <p>Information is used to discuss requirements, prepare estimates, issue invoices, deliver services, provide support, improve operations, and maintain service records.</p>
            <h2>Data Sharing</h2>
            <p>We do not sell customer data. Information may be shared with hosting, payment, email, or technical service providers only when required to deliver the requested service.</p>
            <h2>Data Retention</h2>
            <p>Project, invoice, and support records may be retained for accounting, compliance, dispute resolution, and service continuity.</p>
            <h2>Contact</h2>
            <p>For privacy questions, email novabytetechnoai@gmail.com.</p>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
