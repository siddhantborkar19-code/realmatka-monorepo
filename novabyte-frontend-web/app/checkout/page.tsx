import type { Metadata } from "next";
import Link from "next/link";
import { CashfreePayButton } from "./cashfree-pay-button";
import { businessContact, PageHero, SiteFooter, SiteHeader } from "../site-shell";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "NovaByte Technologies checkout page for approved software, website, app interface, dashboard, maintenance, account credit, hosting support, and digital service payments."
};

const checkoutServices = [
  "Approved Service Credit",
  "Website Development",
  "Business Website",
  "Mobile App UI",
  "Admin Dashboard",
  "Monthly Maintenance",
  "Hosting / Deployment Support",
  "Digital Service Consultation",
  "Custom Software Service"
];

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function CheckoutPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const amount = firstQueryValue(params.amount);
  const reference = firstQueryValue(params.reference);
  const selectedService = firstQueryValue(params.service);
  const paymentSessionId = firstQueryValue(params.session);
  const mode = firstQueryValue(params.mode) || "production";
  const hasPaymentSession = Boolean(paymentSessionId);

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Secure Checkout"
          title={hasPaymentSession ? "Complete your secure payment." : "Pay for approved NovaByte services and account credit."}
          description={
            hasPaymentSession
              ? "NovaByte Technologies secure checkout ready hai. Payment app open karke payment complete karein."
              : "Use this checkout only after receiving a service quote, invoice, account credit request, or payment confirmation from NovaByte Technologies."
          }
        />

        <section className="shell section">
          <div className="checkoutLayout">
            <article className={`panel checkoutPanel ${hasPaymentSession ? "compactCheckoutPanel" : ""}`}>
              <span className="eyebrow">Payment Details</span>
              <h2 className="sectionTitle">{hasPaymentSession ? "Payment ready" : "Service checkout"}</h2>
              <p>
                {hasPaymentSession
                  ? "Amount aur reference verify karein. Secure checkout automatically open hoga; agar open na ho to button dabayein."
                  : "Payments collected here are for NovaByte Technologies services such as websites, mobile app interfaces, admin dashboards, cloud support, maintenance, hosting support, digital service consultation, and approved service credit."}
              </p>

              {hasPaymentSession ? (
                <div className="paymentSummaryCard">
                  <div>
                    <span>Payable Amount</span>
                    <strong>INR {amount || "0.00"}</strong>
                  </div>
                  <div>
                    <span>Payment Reference</span>
                    <strong>{reference || "NovaByte Checkout"}</strong>
                  </div>
                  <div>
                    <span>Payment Purpose</span>
                    <strong>Approved Service Credit</strong>
                  </div>
                </div>
              ) : (
                <form className="checkoutForm">
                  <label>
                    <span>Customer Name</span>
                    <input name="name" placeholder="Enter full name" type="text" />
                  </label>
                  <label>
                    <span>Email Address</span>
                    <input name="email" placeholder="Enter email address" type="email" />
                  </label>
                  <label>
                    <span>Mobile Number</span>
                    <input name="phone" placeholder="Enter mobile number" type="tel" />
                  </label>
                  <label>
                    <span>Service Category</span>
                    <select name="service" defaultValue={selectedService}>
                      <option value="" disabled>Select service</option>
                      {checkoutServices.map((service) => (
                        <option key={service} value={service}>{service}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Amount In INR</span>
                    <input defaultValue={amount} min="1" name="amount" placeholder="Enter approved amount" readOnly={Boolean(amount)} type="number" />
                  </label>
                  <label>
                    <span>Invoice / Quote Reference</span>
                    <input defaultValue={reference} name="reference" placeholder="Optional reference number" readOnly={Boolean(reference)} type="text" />
                  </label>
                  <label>
                    <span>Service Notes</span>
                    <textarea name="notes" placeholder="Briefly mention the approved service or invoice details" rows={4} />
                  </label>
                </form>
              )}

              <div className="checkoutNotice">
                {hasPaymentSession
                  ? "Secure checkout automatically open ho raha hai. Agar open na ho to niche button dabao."
                  : "Secure payment link ya approved account credit request milne ke baad hi payment karein."}
              </div>

              {hasPaymentSession ? (
                <CashfreePayButton autoOpen mode={mode} paymentSessionId={paymentSessionId} />
              ) : (
                <a
                  className="button buttonPrimary fullButton"
                  href={`mailto:${businessContact.email}?subject=Checkout%20Payment%20Request%20-%20NovaByte%20Technologies`}
                >
                  Request Secure Payment Link
                </a>
              )}
            </article>

            <aside className="panel invoiceCard">
              <h3>Business Summary</h3>
              <div className="invoiceBox">
                <div className="invoiceRow"><span>Legal / Business Name</span><strong>{businessContact.legalName}</strong></div>
                <div className="invoiceRow"><span>Category</span><strong>Software / IT Enabled Services / Account Credit</strong></div>
                <div className="invoiceRow"><span>Currency</span><strong>Indian Rupee (INR)</strong></div>
                <div className="invoiceRow"><span>Email</span><strong>{businessContact.email}</strong></div>
                <div className="invoiceRow"><span>Phone</span><strong>{businessContact.phone}</strong></div>
                <div className="invoiceRow"><span>Location</span><strong>{businessContact.location}</strong></div>
              </div>

              <div className="checkoutPolicyLinks">
                <Link href="/pricing">View Pricing</Link>
                <Link href="/terms">Terms And Conditions</Link>
                <Link href="/refund-policy">Refund And Cancellation</Link>
                <Link href="/contact">Contact Us</Link>
              </div>

              <p className="note">
                Do not make payment unless the amount, service scope, or account credit request is already confirmed by NovaByte Technologies.
              </p>
            </aside>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
