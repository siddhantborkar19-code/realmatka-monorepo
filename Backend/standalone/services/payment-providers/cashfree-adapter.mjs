import { createHmac, timingSafeEqual } from "node:crypto";
import { standaloneConfig } from "../../config.mjs";

const cashfreeAppId = process.env.CASHFREE_APP_ID?.trim() || process.env.CASHFREE_CLIENT_ID?.trim() || "";
const cashfreeSecretKey = process.env.CASHFREE_SECRET_KEY?.trim() || process.env.CASHFREE_CLIENT_SECRET?.trim() || "";
const cashfreeEnv = String(process.env.CASHFREE_ENV || "production").trim().toLowerCase();
const cashfreeApiVersion = String(process.env.CASHFREE_API_VERSION || "2023-08-01").trim();

function getCashfreeBaseUrl() {
  return cashfreeEnv === "sandbox" || cashfreeEnv === "test"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
}

function buildCustomerEmail(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function buildCustomerPhone(user) {
  return String(user?.phone || "").replace(/\D/g, "").slice(-10);
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-version": cashfreeApiVersion,
    "x-client-id": cashfreeAppId,
    "x-client-secret": cashfreeSecretKey
  };
}

export function isCashfreeEnabled() {
  return Boolean(cashfreeAppId && cashfreeSecretKey);
}

export function getCashfreeMode() {
  return cashfreeEnv === "sandbox" || cashfreeEnv === "test" ? "sandbox" : "production";
}

export async function createCashfreeOrder({ amount, receipt, paymentOrderId, user }) {
  if (!isCashfreeEnabled()) {
    throw new Error("Cashfree keys are not configured");
  }

  const phone = buildCustomerPhone(user);
  if (!phone) {
    throw new Error("Customer phone is required for Cashfree checkout");
  }

  const apiOrigin = (process.env.PAYMENTS_PUBLIC_ORIGIN || process.env.PUBLIC_API_ORIGIN || standaloneConfig.apiUrl || "").replace(/\/$/, "");
  const siteOrigin = (process.env.NOVABYTE_SITE_URL || process.env.DEPOSIT_EXTERNAL_SITE_URL || "https://www.novabytetech.in").replace(/\/$/, "");
  const returnUrl = `${siteOrigin}/payment-success?reference=${encodeURIComponent(receipt)}&order_id=${encodeURIComponent(receipt)}`;
  const notifyUrl = process.env.CASHFREE_NOTIFY_URL?.trim() || (apiOrigin ? `${apiOrigin}/api/payments/webhook` : undefined);
  const email = buildCustomerEmail(user);

  const payload = {
    order_id: receipt,
    order_amount: Number(amount).toFixed(2),
    order_currency: "INR",
    customer_details: {
      customer_id: `cust_${receipt}`,
      customer_name: String(user?.name || "Customer").trim() || "Customer",
      customer_phone: phone,
      ...(email ? { customer_email: email } : {})
    },
    order_meta: {
      return_url: returnUrl,
      ...(notifyUrl ? { notify_url: notifyUrl } : {})
    },
    order_note: "NovaByte Account Credit",
    order_tags: {
      paymentOrderId,
      reference: receipt,
      purpose: "account_credit"
    }
  };

  const response = await fetch(`${getCashfreeBaseUrl()}/orders`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.payment_session_id) {
    throw new Error(body?.message || body?.error_description || "Unable to create Cashfree order");
  }
  return body;
}

export async function fetchCashfreeOrderStatus(orderId) {
  if (!orderId || !isCashfreeEnabled()) {
    return null;
  }
  const response = await fetch(`${getCashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: getHeaders()
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.order_id) {
    throw new Error(body?.message || body?.error_description || "Unable to fetch Cashfree order status");
  }
  return body;
}

export function verifyCashfreeWebhookSignature(rawBody, signature, timestamp) {
  if (!cashfreeSecretKey || !signature || !timestamp) {
    return false;
  }
  const expected = createHmac("sha256", cashfreeSecretKey).update(`${timestamp}${rawBody}`).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}
