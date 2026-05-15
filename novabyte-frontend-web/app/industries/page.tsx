import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Industries We Serve",
  description: "Industries served by NovaByte Technologies including local businesses, service providers, education, retail, events, and digital agencies."
};

const industries = [
  "Local Businesses",
  "Service Providers",
  "Education And Coaching",
  "Events And Wedding Services",
  "Retail And Small Commerce",
  "Digital Agencies",
  "Professional Services",
  "Online Support Teams"
];

export default function IndustriesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Industries" title="Digital systems for service-led businesses and local teams." description="NovaByte Technologies supports industries that need websites, customer communication, support workflows, admin tools, and cloud operations." />
        <section className="shell section">
          <div className="grid3">
            {industries.map((industry) => (
              <article className="panel serviceCard" key={industry}>
                <span className="projectTag">Industry</span>
                <strong>{industry}</strong>
                <p>Websites, dashboards, communication tools, service billing, and digital operations support can be tailored for this business category.</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
