import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Customer Login",
  description: "Customer login page for NovaByte Technologies account credit, service balance, support, and digital service records."
};

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Customer Login"
          title="Access your NovaByte customer account."
          description="Customers can use this account area for service balance, account credit, support records, invoices, and payment references."
        />
        <section className="shell section">
          <div className="checkoutLayout">
            <article className="panel checkoutPanel">
              <span className="eyebrow">Login</span>
              <h2 className="sectionTitle">Sign in with mobile or email</h2>
              <form className="checkoutForm">
                <label>
                  <span>Email Or Mobile</span>
                  <input placeholder="Enter email or mobile number" type="text" />
                </label>
                <label>
                  <span>Password / OTP</span>
                  <input placeholder="Enter password or OTP" type="password" />
                </label>
              </form>
              <Link className="button buttonPrimary fullButton" href="/account">
                Continue To Account
              </Link>
              <p className="note">Live authentication will be enabled with the production customer backend.</p>
            </article>
            <aside className="panel invoiceCard">
              <h3>Account Features</h3>
              <ul className="list">
                <li>View service balance and account credit</li>
                <li>Add funds for approved digital services</li>
                <li>Track payment references and invoices</li>
                <li>Manage support and maintenance requests</li>
              </ul>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
