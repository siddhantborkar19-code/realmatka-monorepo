import { businessContact, SiteFooter, SiteHeader } from "./site-shell";

const services = [
  {
    title: "Website & Landing Pages",
    body: "Fast, mobile-first websites, landing pages, product pages, SEO-ready content sections, and enquiry flows for small and growing businesses."
  },
  {
    title: "Mobile App Interfaces",
    body: "React Native screens, app onboarding flows, dashboards, wallet-style interfaces, notifications, and support-oriented mobile experiences."
  },
  {
    title: "Admin Dashboards",
    body: "Internal panels for user management, reports, approvals, operations, content publishing, support teams, and daily monitoring."
  },
  {
    title: "Cloud & Deployment",
    body: "Domain setup, hosting, deployment support, environment configuration, backups, monitoring checks, and release coordination."
  },
  {
    title: "Digital Operations",
    body: "Customer support workflows, notification systems, data entry tools, spreadsheet-to-dashboard conversions, and process automation."
  },
  {
    title: "Maintenance Retainers",
    body: "Monthly care plans for bug fixes, UI improvements, performance cleanup, content updates, and technical support."
  }
];

const processSteps = [
  "Requirement discussion and scope confirmation",
  "Estimate, invoice, and service timeline",
  "Design, development, and review cycles",
  "Deployment, handover, and support"
];

const billingItems = [
  "Website or mobile app development invoice",
  "Hosting, deployment, domain, or cloud support",
  "Monthly maintenance and technical support retainer",
  "Dashboard, automation, or digital operations service"
];

const pricingPreview = [
  { title: "Starter Website", price: "INR 4,999 onwards", body: "Landing page or small business website with essential sections and contact CTA." },
  { title: "Admin Dashboard", price: "INR 19,999 onwards", body: "Internal dashboard, approval workflow, reports, records, and support tools." },
  { title: "Monthly Care", price: "INR 2,999 / month onwards", body: "Bug fixes, updates, monitoring, support, and small improvements every month." }
];

const industries = ["Local Businesses", "Service Providers", "Education", "Events", "Retail", "Digital Agencies"];

const techStack = ["Next.js", "React Native", "Node.js", "PostgreSQL", "Cloud Hosting", "API Integrations"];

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main id="top">
        <section className="shell hero">
          <div className="heroGrid">
            <div>
              <span className="eyebrow">Software | Web | Cloud | Operations</span>
              <h1>Technology support that turns everyday business work into clean digital systems.</h1>
              <p className="lead">
                NovaByte Technologies helps businesses build websites, mobile-ready applications, internal dashboards, cloud workflows, customer support systems, and reliable digital operations.
              </p>
              <div className="actions">
                <a className="button buttonPrimary" href="#contact">
                  Start A Project
                </a>
                <a className="button buttonSecondary" href="/pricing">
                  View Plans & Pricing
                </a>
                <a className="button buttonSecondary" href="/checkout">
                  Pay For Approved Service
                </a>
              </div>
            </div>

            <aside className="panel heroCard">
              <span className="cardKicker">What we deliver</span>
              <h2>Practical software for real operating teams.</h2>
              <p>
                We focus on useful systems: admin panels, payment-ready service websites, support tools, reporting pages, and mobile interfaces that are simple for teams and customers to use.
              </p>
              <div className="heroStats">
                <div>
                  <strong>Web</strong>
                  <span>Business sites</span>
                </div>
                <div>
                  <strong>App</strong>
                  <span>Mobile UI</span>
                </div>
                <div>
                  <strong>Ops</strong>
                  <span>Dashboards</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="shell section" id="services">
          <div className="sectionHead">
            <span className="eyebrow">Services</span>
            <h2 className="sectionTitle">Build, maintain, and operate digital products from one place.</h2>
            <p>Choose one-time development, monthly maintenance, or ongoing digital operations support depending on your business needs.</p>
          </div>
          <div className="grid3">
            {services.map((service) => (
              <article className="panel serviceCard" key={service.title}>
                <strong>{service.title}</strong>
                <p>{service.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shell section" id="process">
          <div className="processGrid">
            <div>
              <span className="eyebrow">Process</span>
              <h2 className="sectionTitle">Clear steps before any payment or delivery work begins.</h2>
              <p className="sectionCopy">
                Every project starts with a scope, estimate, and timeline so the customer knows what is being delivered and what the payment is for.
              </p>
            </div>
            <div className="panel processPanel">
              {processSteps.map((step, index) => (
                <div className="processStep" key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="shell section">
          <div className="sectionHead">
            <span className="eyebrow">Pricing</span>
            <h2 className="sectionTitle">Flexible pricing for websites, dashboards, apps, and support.</h2>
            <p>Prices are listed in INR with final quote after requirement review, so customers pay only for approved work.</p>
          </div>
          <div className="grid3">
            {pricingPreview.map((plan) => (
              <article className="panel serviceCard" key={plan.title}>
                <span className="projectTag">{plan.price}</span>
                <strong>{plan.title}</strong>
                <p>{plan.body}</p>
              </article>
            ))}
          </div>
          <div className="actions">
            <a className="button buttonSecondary" href="/pricing">
              View Pricing Details
            </a>
            <a className="button buttonPrimary" href="/checkout">
              Proceed To Checkout
            </a>
            <a className="button buttonSecondary" href="/support-plans">
              Support Plans
            </a>
          </div>
        </section>

        <section className="shell section">
          <div className="billingLayout">
            <article className="panel infoPanel">
              <span className="eyebrow">Industries</span>
              <h2 className="sectionTitle">Built for practical service businesses and operating teams.</h2>
              <div className="tagCloud">
                {industries.map((item) => (
                  <span className="badge" key={item}>{item}</span>
                ))}
              </div>
            </article>
            <article className="panel infoPanel">
              <span className="eyebrow">Technology</span>
              <h2 className="sectionTitle">Modern stack for web, mobile, backend, and cloud work.</h2>
              <div className="tagCloud">
                {techStack.map((item) => (
                  <span className="badge" key={item}>{item}</span>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="shell section" id="billing">
          <div className="billingLayout">
            <div className="panel billingPanel">
              <span className="cardKicker">Billing & Invoices</span>
              <h2>Payments are collected only against approved service work.</h2>
              <p>
                Customers can request an invoice or payment link for software development, digital service balance, hosting support, deployment assistance, maintenance retainers, or approved technical work.
              </p>
              <ul className="list">
                {billingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="actions">
                <a className="button buttonPrimary" href="/checkout">
                  Open Secure Checkout
                </a>
                <a className="button buttonSecondary" href="/billing">
                  Billing Details
                </a>
              </div>
            </div>
            <div className="panel invoiceCard">
              <h3>Business Details</h3>
              <div className="invoiceBox">
                <div className="invoiceRow">
                  <span>Legal / Business Name</span>
                  <strong>{businessContact.legalName}</strong>
                </div>
                <div className="invoiceRow">
                  <span>Service Category</span>
                  <strong>Software / IT Enabled Services</strong>
                </div>
                <div className="invoiceRow">
                  <span>Support Email</span>
                  <strong>{businessContact.email}</strong>
                </div>
                <div className="invoiceRow">
                  <span>Support Phone</span>
                  <strong>{businessContact.phone}</strong>
                </div>
              </div>
              <a className="button buttonPrimary fullButton" href={`mailto:${businessContact.email}?subject=Quote%20Request%20-%20NovaByte%20Technologies`}>
                Request Quote
              </a>
            </div>
          </div>
        </section>

        <section className="shell section">
          <div className="panel infoPanel">
            <span className="eyebrow">Company Objective</span>
            <h2 className="sectionTitle">Software products, websites, mobile applications, IT enabled services, cloud support, and digital operations.</h2>
            <p>
              NovaByte Technologies provides technology services including web development, app development, dashboards, customer support systems, content publishing tools, digital marketing support, cloud services, maintenance, and related technology solutions.
            </p>
          </div>
        </section>

        <section className="shell section">
          <div className="billingLayout">
            <article className="panel infoPanel">
              <span className="eyebrow">FAQ</span>
              <h2 className="sectionTitle">Common customer questions answered clearly.</h2>
              <p>Project timelines, payment process, delivery, support, refund, and maintenance details are documented for customers and payment review.</p>
              <a className="button buttonSecondary" href="/faq">Read FAQ</a>
            </article>
            <article className="panel infoPanel">
              <span className="eyebrow">Company Details</span>
              <h2 className="sectionTitle">Clear business and support information for customers.</h2>
              <p>Review our legal business name, service category, support contact, business location, and customer service hours.</p>
              <a className="button buttonSecondary" href="/company-registration">View Company Details</a>
            </article>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
