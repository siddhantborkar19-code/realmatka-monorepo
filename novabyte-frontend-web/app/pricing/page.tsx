import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Pricing And Service Plans",
  description: "NovaByte Technologies pricing plans for websites, app UI, admin dashboards, maintenance, and technical support services."
};

const plans = [
  { name: "Starter Website", price: "Quote based", details: ["Single landing page or small website", "Mobile responsive layout", "Contact CTA and basic SEO setup"] },
  { name: "Business Website", price: "Quote based", details: ["Multi-page service website", "Policy pages and enquiry flow", "Performance and deployment support"] },
  { name: "Mobile App UI", price: "Scope based", details: ["React Native screen design", "Login/profile/dashboard flows", "Build and handover support"] },
  { name: "Admin Dashboard", price: "Scope based", details: ["Records and approval workflows", "Reports and filters", "Operator-friendly internal tools"] },
  { name: "Monthly Maintenance", price: "Retainer", details: ["Bug fixes and small updates", "Monitoring and backups guidance", "Priority technical support"] }
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Pricing" title="Transparent service plans with final pricing after scope review." description="Every project is estimated based on features, timeline, revisions, integrations, and support needs." />
        <section className="shell section">
          <div className="grid3">
            {plans.map((plan) => (
              <article className="panel serviceCard" key={plan.name}>
                <span className="projectTag">{plan.price}</span>
                <strong>{plan.name}</strong>
                <ul className="list">
                  {plan.details.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
