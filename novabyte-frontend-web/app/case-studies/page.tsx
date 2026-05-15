import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Case Studies",
  description: "Example case studies for NovaByte Technologies including business websites, admin dashboards, mobile app UI, and cloud setup."
};

const cases = [
  { title: "Business Website Setup", result: "A clean website with service pages, policies, contact CTA, and deployment-ready structure." },
  { title: "Admin Dashboard Setup", result: "Internal tools for approvals, reports, users, records, support, and operational monitoring." },
  { title: "Mobile App UI Setup", result: "Customer-facing mobile screens for account, balance, history, support, and notifications." },
  { title: "Cloud Deployment Setup", result: "Environment setup, domain linking, backend deployment, and basic release checks." }
];

export default function CaseStudiesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Case Studies" title="Example project formats NovaByte Technologies can deliver." description="These sample case studies explain common project types and expected outcomes." />
        <section className="shell section">
          <div className="grid3">
            {cases.map((item) => (
              <article className="panel serviceCard portfolioCard" key={item.title}>
                <span className="projectTag">Case Study</span>
                <strong>{item.title}</strong>
                <p>{item.result}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
