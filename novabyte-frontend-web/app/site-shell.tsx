import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/products/picstur", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/checkout", label: "Checkout" },
  { href: "/billing", label: "Billing" },
  { href: "/login", label: "Login" },
  { href: "/contact", label: "Contact" }
];

const resourceItems = [
  { href: "/industries", label: "Industries" },
  { href: "/tech-stack", label: "Tech Stack" },
  { href: "/case-studies", label: "Case Studies" },
  { href: "/support-plans", label: "Support Plans" },
  { href: "/account", label: "Customer Account" },
  { href: "/account/add-fund", label: "Add Account Credit" },
  { href: "/faq", label: "FAQ" },
  { href: "/careers", label: "Careers" },
  { href: "/company-registration", label: "Company Details" }
];

const policyItems = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/delivery-policy", label: "Delivery Policy" }
];

export const businessContact = {
  legalName: "NovaByte Technologies",
  email: "novabytetechnoai@gmail.com",
  phone: "+91 8446012081",
  location: "Maharashtra, India",
  supportHours: "10:00 AM - 7:00 PM IST"
};

export function SiteHeader() {
  return (
    <header className="topbar">
      <nav className="shell nav" aria-label="Primary">
        <Link className="brand" href="/">
          <span className="brandMark">NB</span>
          <span>NovaByte Technologies</span>
        </Link>
        <div className="navLinks">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="shell footer" id="contact">
      <div className="footerGrid">
        <div>
          <Link className="brand footerBrand" href="/">
            <span className="brandMark">NB</span>
            <span>{businessContact.legalName}</span>
          </Link>
          <p>Software, websites, mobile interfaces, cloud support, digital operations, and IT enabled services.</p>
          <p className="footerFineprint">Legal / Business Name: {businessContact.legalName}</p>
        </div>
        <div>
          <strong>Company</strong>
          <div className="footerLinks">
            {navItems.slice(1).map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <strong>Resources</strong>
          <div className="footerLinks">
            {resourceItems.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <strong>Policies</strong>
          <div className="footerLinks">
            {policyItems.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <strong>Contact</strong>
          <div className="footerLinks">
            <a href={`mailto:${businessContact.email}`}>{businessContact.email}</a>
            <a href={`tel:${businessContact.phone.replace(/\s/g, "")}`}>{businessContact.phone}</a>
            <span>{businessContact.location}</span>
            <span>Support Hours: {businessContact.supportHours}</span>
          </div>
        </div>
      </div>
      <div className="footerInner">
        <span>(c) 2026 NovaByte Technologies. All rights reserved.</span>
        <span>Digital services delivered online.</span>
      </div>
    </footer>
  );
}

export function PageHero({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="shell pageHero">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="lead">{description}</p>
    </section>
  );
}
