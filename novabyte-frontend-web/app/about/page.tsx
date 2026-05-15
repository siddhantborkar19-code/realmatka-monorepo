import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "About NovaByte Technologies",
  description: "Learn about NovaByte Technologies, a software and digital services provider for web, app, cloud, support, and operations workflows."
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="About"
          title="A practical technology partner for businesses that need reliable digital systems."
          description="NovaByte Technologies focuses on building useful software, websites, mobile interfaces, cloud workflows, and internal tools that help businesses operate with more clarity."
        />
        <section className="shell section">
          <div className="billingLayout">
            <article className="panel infoPanel">
              <h2 className="sectionTitle">Who We Are</h2>
              <p>
                NovaByte Technologies is a technology services business from Maharashtra, India. We work on digital products, websites, mobile-ready interfaces, admin dashboards, cloud support, customer support systems, and IT enabled operations.
              </p>
              <p>
                Our goal is to help service-led businesses move from manual work to cleaner digital workflows that are easier to manage, monitor, and improve.
              </p>
            </article>
            <article className="panel infoPanel">
              <h2 className="sectionTitle">What We Value</h2>
              <ul className="list">
                <li>Clear scope before project work starts</li>
                <li>Simple interfaces that teams can actually use</li>
                <li>Reliable delivery, maintenance, and support</li>
                <li>Transparent invoice-based billing for approved services</li>
              </ul>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
