import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, SiteFooter, SiteHeader } from "../../site-shell";

export const metadata: Metadata = {
  title: "Add Fund",
  description: "Add NovaByte account credit for approved service balance, support balance, maintenance, and digital operations."
};

export default function AddFundPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Add Fund"
          title="Add credit to your NovaByte account."
          description="Use this page for approved account credit, service balance, support balance, or maintenance balance payments."
        />
        <section className="shell section">
          <div className="checkoutLayout">
            <article className="panel checkoutPanel">
              <span className="eyebrow">Account Credit</span>
              <h2 className="sectionTitle">Create fund request</h2>
              <form className="checkoutForm">
                <label>
                  <span>Customer Name</span>
                  <input placeholder="Enter full name" type="text" />
                </label>
                <label>
                  <span>Mobile Number</span>
                  <input placeholder="Enter mobile number" type="tel" />
                </label>
                <label>
                  <span>Email Address</span>
                  <input placeholder="Enter email address" type="email" />
                </label>
                <label>
                  <span>Amount In INR</span>
                  <input min="100" placeholder="Minimum INR 100" type="number" />
                </label>
                <label>
                  <span>Credit Purpose</span>
                  <select defaultValue="Account Credit / Wallet Top-up">
                    <option>Account Credit / Wallet Top-up</option>
                    <option>Daily Digital Support Balance</option>
                    <option>Monthly Maintenance Balance</option>
                    <option>Service Usage Credit</option>
                  </select>
                </label>
                <label>
                  <span>Notes</span>
                  <textarea placeholder="Optional service or reference note" rows={4} />
                </label>
              </form>
              <Link className="button buttonPrimary fullButton" href="/checkout">
                Continue To Checkout
              </Link>
            </article>
            <aside className="panel invoiceCard">
              <h3>How credit works</h3>
              <ul className="list">
                <li>Customer creates an account credit request.</li>
                <li>Payment is completed through secure checkout.</li>
                <li>Payment status is verified before credit update.</li>
                <li>Credit can be adjusted against approved services or support balance.</li>
              </ul>
              <p className="note">Credit confirmation depends on successful payment verification and matching reference details.</p>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
