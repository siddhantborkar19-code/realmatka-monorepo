import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Portfolio And Work Samples",
  description: "Explore example work categories from NovaByte Technologies including business websites, dashboards, app interfaces, support systems, and cloud setup."
};

const projects = [
  {
    title: "Business Website",
    tag: "Website",
    body: "A fast landing website with service sections, contact CTA, policy pages, and SEO-ready content structure."
  },
  {
    title: "Admin Operations Dashboard",
    tag: "Dashboard",
    body: "Internal panel for records, approvals, reports, monitoring, support, and daily operational actions."
  },
  {
    title: "Mobile App Interface",
    tag: "App UI",
    body: "Mobile-ready screens for login, wallet-style balance, history, notifications, support, and profile workflows."
  },
  {
    title: "Support Workflow System",
    tag: "Support",
    body: "Customer message handling, support status, operator notes, and response tracking for service teams."
  },
  {
    title: "Cloud Deployment Setup",
    tag: "Cloud",
    body: "Domain configuration, backend deployment, environment variables, release checks, and basic monitoring setup."
  },
  {
    title: "Billing And Invoice Flow",
    tag: "Billing",
    body: "Service request intake, invoice detail collection, payment link request, and post-payment support workflow."
  }
];

export default function PortfolioPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Portfolio"
          title="Example work categories for software, service websites, dashboards, and digital operations."
          description="These portfolio categories show the type of projects NovaByte Technologies can deliver for service businesses and internal teams."
        />
        <section className="shell section">
          <div className="grid3">
            {projects.map((project) => (
              <article className="panel serviceCard portfolioCard" key={project.title}>
                <span className="projectTag">{project.tag}</span>
                <strong>{project.title}</strong>
                <p>{project.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
