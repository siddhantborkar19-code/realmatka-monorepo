import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../../site-shell";

export const metadata: Metadata = {
  title: "Digital Product Selling Website Project",
  description:
    "Ready-made digital product selling website project with frontend user website, vendor dashboard, admin panel, backend API, deployment support, and setup guide."
};

const deliverables = [
  {
    title: "Frontend user website",
    body: "Customer-facing website where users can browse products/services, create account, place order, track status, and access delivery."
  },
  {
    title: "Vendor dashboard",
    body: "Vendor panel for profile, product/service packages, incoming orders, delivery status, payout overview, and customer handling."
  },
  {
    title: "Admin panel",
    body: "Owner control panel for users, vendors, orders, payments, payouts, reports, storage, support, and platform settings."
  },
  {
    title: "Backend API",
    body: "Server APIs for authentication, orders, vendors, payments, admin actions, file delivery, status tracking, and reports."
  },
  {
    title: "Deployment support",
    body: "Support for domain setup, hosting, backend deployment, environment variables, storage configuration, and release checks."
  },
  {
    title: "Basic setup guide",
    body: "Handover notes for installation, environment setup, branding changes, payment keys, cloud storage, and admin access."
  }
];

const userFeatures = [
  "Browse photo services",
  "Create customer account",
  "Place photo delivery order",
  "Track order status",
  "Access delivered album"
];

const vendorFeatures = [
  "Vendor profile",
  "Service package setup",
  "Order queue",
  "Upload delivery status",
  "Payout overview"
];

const adminFeatures = [
  "User and vendor management",
  "Order monitoring",
  "Payment and payout review",
  "Storage and delivery control",
  "Support and reports"
];

const saleModels = [
  "Source code sale",
  "Custom setup service",
  "White-label version",
  "Monthly maintenance",
  "Future SaaS subscription"
];

const productCards = ["Premium Album", "Event Gallery", "Express Delivery"];
const vendorRows = [
  ["ORD-1024", "Premium Album", "Rs 2,499", "New"],
  ["ORD-1025", "Event Gallery", "Rs 1,299", "Working"],
  ["ORD-1026", "Express Delivery", "Rs 899", "Ready"]
];
const adminRows = [
  ["New vendor", "Approval pending", "Review"],
  ["Payment", "Verification needed", "Check"],
  ["Delivery", "Customer reported issue", "Open"]
];

export default function PicsturProductPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="shell picsturHero">
          <div>
            <span className="eyebrow">Digital Product For Sale</span>
            <h1>Ready-made digital product selling website with user, vendor, and admin panels.</h1>
            <p className="lead">
              This is a complete sellable website project for businesses that need customer ordering, vendor management, admin control, payment workflow, delivery tracking, and backend APIs. This showcase uses static dummy UI previews only, with no real customer data or secret keys.
            </p>
            <div className="productPriceBox">
              <span>Starting Price</span>
              <strong>INR 49,999 onwards</strong>
              <p>Final quote depends on branding, deployment, payment gateway setup, storage, and custom changes.</p>
            </div>
            <div className="actions">
              <a className="button buttonPrimary" href="#screens">
                View Frontend Preview
              </a>
              <a className="button buttonPrimary" href="/checkout?service=Digital+Product+Selling+Website&amount=49999&reference=PicStur+Project+Quote">
                Proceed To Checkout
              </a>
              <a className="button buttonSecondary" href="mailto:novabytetechnoai@gmail.com?subject=Digital%20Product%20Website%20Project%20Sale">
                Ask For Project Details
              </a>
            </div>
          </div>
          <div className="panel picsturDevice">
            <div className="deviceTop">
              <span />
              <span />
              <span />
            </div>
            <div className="deviceHero">
              <strong>Digital Product Website</strong>
              <p>Selling website project with customer frontend, vendor dashboard, admin panel, and backend modules.</p>
            </div>
            <div className="photoGrid">
              {Array.from({ length: 9 }, (_, index) => (
                <div className={`photoTile tile${index + 1}`} key={index} />
              ))}
            </div>
          </div>
        </section>

        <section className="shell section">
          <div className="sectionHead">
            <span className="eyebrow">Buyer Gets</span>
            <h2 className="sectionTitle">A complete sellable project package, not just a single HTML page.</h2>
            <p>The product can be sold as source code, customized setup, white-label website, or maintained digital platform.</p>
          </div>
          <div className="grid3">
            {deliverables.map((item) => (
              <article className="panel serviceCard" key={item.title}>
                <span className="projectTag">Included</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shell section" id="screens">
          <div className="sectionHead">
            <span className="eyebrow">Frontend Preview</span>
            <h2 className="sectionTitle">Static UI previews for user website, vendor dashboard, and admin panel.</h2>
            <p>These screens are presentation mockups using dummy labels only. Final buyer setup uses buyer branding, domain, payment gateway, and cloud storage.</p>
          </div>
          <div className="productScreens">
            <article className="panel screenPreview userScreen">
              <div className="screenTop">
                <span>Customer Website</span>
                <strong>Browse, order, pay, track, and receive delivery</strong>
              </div>
              <div className="websiteMockHero">
                <div>
                  <strong>Customer Storefront</strong>
                  <p>Modern frontend for product/service listing, order placement, account login, and delivery tracking.</p>
                  <span className="miniButton">Place Order</span>
                </div>
              </div>
              <div className="storefrontCards">
                {productCards.map((item, index) => (
                  <div className="storefrontCard" key={item}>
                    <div className={`storefrontThumb thumb${index + 1}`} />
                    <strong>{item}</strong>
                    <span>View package</span>
                  </div>
                ))}
              </div>
              <div className="featureChips">
                {userFeatures.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
            </article>

            <article className="panel screenPreview vendorScreen">
              <div className="screenTop">
                <span>Vendor Dashboard</span>
                <strong>Manage packages, jobs, and delivery</strong>
              </div>
              <p className="screenSummary">
                Vendor ko apna profile, service/product packages, new orders, order progress, delivery updates, payout summary, aur support requests manage karne ka panel milega.
              </p>
              <div className="dashboardFrame">
                <aside className="mockSidebar">
                  <strong>Vendor</strong>
                  <span>Orders</span>
                  <span>Packages</span>
                  <span>Payouts</span>
                  <span>Support</span>
                </aside>
                <div className="mockContent">
                  <div className="dashboardTable">
                    <div><span>New Orders</span><strong>24</strong></div>
                    <div><span>In Progress</span><strong>11</strong></div>
                    <div><span>Delivered</span><strong>86</strong></div>
                  </div>
                  <div className="mockMiniTable">
                    {vendorRows.map((row) => (
                      <div key={row[0]}>
                        <span>{row[0]}</span>
                        <strong>{row[1]}</strong>
                        <span>{row[2]}</span>
                        <em>{row[3]}</em>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="featureChips">
                {vendorFeatures.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
            </article>

            <article className="panel screenPreview adminScreen">
              <div className="screenTop">
                <span>Admin Panel</span>
                <strong>Control users, vendors, payments, and reports</strong>
              </div>
              <p className="screenSummary">
                Admin ko complete ownership milega: user/vendor approval, order monitoring, payment review, payout control, reports, support, storage, aur platform settings.
              </p>
              <div className="dashboardFrame adminFrame">
                <aside className="mockSidebar adminSidebar">
                  <strong>Admin</strong>
                  <span>Users</span>
                  <span>Vendors</span>
                  <span>Payments</span>
                  <span>Reports</span>
                </aside>
                <div className="mockContent">
                  <div className="adminBars">
                    <div><span>Orders</span><strong style={{ width: "86%" }} /></div>
                    <div><span>Vendors</span><strong style={{ width: "72%" }} /></div>
                    <div><span>Payments</span><strong style={{ width: "64%" }} /></div>
                    <div><span>Storage</span><strong style={{ width: "58%" }} /></div>
                  </div>
                  <div className="mockMiniTable">
                    {adminRows.map((row) => (
                      <div key={row[0]}>
                        <span>{row[0]}</span>
                        <strong>{row[1]}</strong>
                        <em>{row[2]}</em>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="featureChips">
                {adminFeatures.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="shell section">
          <div className="billingLayout">
            <article className="panel billingPanel">
              <span className="cardKicker">How It Can Be Sold</span>
              <h2>Sell it as a digital product, custom setup, or white-label project.</h2>
              <p>
                This project can be positioned as a ready-made digital product selling website for clients who want customer ordering, vendor operations, admin control, payment workflow, delivery tracking, and backend management.
              </p>
              <ul className="list">
                {saleModels.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="panel invoiceCard">
              <h3>Commercial Package</h3>
              <div className="invoiceBox">
                <div className="invoiceRow"><span>Product</span><strong>Digital Product Selling Website</strong></div>
                <div className="invoiceRow"><span>Starting Price</span><strong>INR 49,999 onwards</strong></div>
                <div className="invoiceRow"><span>Category</span><strong>Digital Product / Source Code / Setup</strong></div>
                <div className="invoiceRow"><span>Demo</span><strong>Dummy UI preview only</strong></div>
                <div className="invoiceRow"><span>Secrets</span><strong>Not included in demo</strong></div>
              </div>
              <a className="button buttonPrimary fullButton" href="/checkout?service=Digital+Product+Selling+Website&amount=49999&reference=PicStur+Project+Quote">
                Pay For Approved Product Quote
              </a>
              <a className="button buttonPrimary fullButton" href="mailto:novabytetechnoai@gmail.com?subject=Digital%20Product%20Website%20Proposal">
                Request Product Proposal
              </a>
            </article>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
