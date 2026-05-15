import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Technology Stack",
  description: "Technology stack used by NovaByte Technologies for websites, apps, backends, databases, APIs, and cloud deployments."
};

const stack = [
  ["Frontend", "Next.js, React, responsive CSS, SEO-ready web pages"],
  ["Mobile", "React Native, Expo-style workflows, Android app interfaces"],
  ["Backend", "Node.js APIs, authentication, wallets, dashboards, and integrations"],
  ["Database", "PostgreSQL, structured data, reports, and backups"],
  ["Cloud", "Domain setup, hosting, deployment, environment configuration"],
  ["Integrations", "Email, notifications, payment links, APIs, admin workflows"]
];

export default function TechStackPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Technology" title="A practical stack for modern web, mobile, backend, and cloud work." description="The stack is selected based on project needs, performance, maintainability, and support requirements." />
        <section className="shell section">
          <div className="grid3">
            {stack.map(([title, body]) => (
              <article className="panel serviceCard" key={title}>
                <span className="projectTag">Stack</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
