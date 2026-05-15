import type { Metadata } from "next";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Pricing And Service Plans",
  description: "NovaByte Technologies pricing plans for account credit, websites, app UI, admin dashboards, maintenance, and technical support services."
};

const plans = [
  {
    name: "Account Credit / Wallet Top-up",
    price: "INR 100 onwards",
    details: ["Customer-requested account credit", "Payment reference generated for tracking", "Credit confirmation after successful payment verification", "Used for approved account balance, support balance, or service balance requests"]
  },
  {
    name: "Daily Digital Support Balance",
    price: "INR 500 onwards",
    details: ["Balance for day-to-day technical support", "Small content updates or troubleshooting", "Support ticket/account usage tracking", "Useful for recurring online service customers"]
  },
  {
    name: "Service Usage Credit",
    price: "INR 1,000 onwards",
    details: ["Credit for approved recurring digital operations", "Can be adjusted against support, maintenance, or account services", "Payment verification before account update", "Usage history maintained for customer reference"]
  },
  {
    name: "Starter Website",
    price: "INR 4,999 onwards",
    details: ["Single landing page or small website", "Mobile responsive layout", "Contact CTA and basic SEO setup", "Delivery estimate: 3 to 7 business days"]
  },
  {
    name: "Business Website",
    price: "INR 12,999 onwards",
    details: ["Multi-page service website", "Policy pages and enquiry flow", "Performance and deployment support", "Delivery estimate: 7 to 15 business days"]
  },
  {
    name: "Mobile App UI",
    price: "INR 14,999 onwards",
    details: ["React Native screen design", "Login/profile/dashboard flows", "Build and handover support", "Delivery estimate: 10 to 20 business days"]
  },
  {
    name: "Admin Dashboard",
    price: "INR 19,999 onwards",
    details: ["Records and approval workflows", "Reports and filters", "Operator-friendly internal tools", "Delivery estimate: 15 to 30 business days"]
  },
  {
    name: "Monthly Maintenance",
    price: "INR 2,999 / month onwards",
    details: ["Bug fixes and small updates", "Monitoring and backups guidance", "Priority technical support", "Monthly support cycle"]
  },
  {
    name: "Digital Service Consultation",
    price: "INR 999 onwards",
    details: ["Requirement review call", "Basic technical guidance", "Scope and estimate preparation", "Remote delivery via email/online meeting"]
  }
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="Pricing" title="Listed service prices in INR with final quote after scope review." description="Starting prices are listed below. Final amount depends on account credit amount, features, timeline, revisions, integrations, third-party costs, and support needs." />
        <section className="shell section">
          <div className="sectionHead">
            <span className="eyebrow">Service Price List</span>
            <h2 className="sectionTitle">Account credit, software, website, app interface, dashboard, and maintenance services.</h2>
            <p>All prices are in Indian Rupees (INR). GST or taxes, if applicable after registration, may be charged separately.</p>
          </div>
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
          <article className="panel policyPanel priceNote">
            <h2>Payment Terms</h2>
            <p>For fixed-scope work, payment may be collected as advance, milestone payment, or full payment depending on the approved estimate. Account credit or wallet top-up payments are processed only after the customer confirms the amount and payment reference. Work or credit confirmation starts only after payment verification.</p>
            <h2>What Is Included</h2>
            <p>Each service includes agreed design/development work, basic testing, delivery support, and handover of agreed files or deployed pages. Account credit payments include payment verification and account balance update where applicable. Additional features, paid tools, hosting, domains, or third-party services may be billed separately after approval.</p>
          </article>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
