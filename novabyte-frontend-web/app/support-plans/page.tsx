import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Support And Maintenance Plans",
  description: "Support and maintenance plans from NovaByte Technologies for websites, apps, dashboards, cloud setup, and digital operations."
};

const plans = [
  { title: "Basic Support", body: "Small fixes, content updates, minor troubleshooting, and standard email support." },
  { title: "Priority Support", body: "Faster response for active business websites, dashboards, app screens, and cloud workflows." },
  { title: "Monthly Maintenance", body: "Regular checks, small improvements, release coordination, backups guidance, and technical care." }
];

export default function SupportPlansPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Support Plans" title="Maintenance and support for businesses that need reliable digital systems." description="Support can be provided after delivery or as a monthly retainer for websites, dashboards, apps, and operations tools." />
        <section className="shell section">
          <div className="grid3">
            {plans.map((plan) => (
              <article className="panel serviceCard" key={plan.title}>
                <span className="projectTag">Support</span>
                <strong>{plan.title}</strong>
                <p>{plan.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
