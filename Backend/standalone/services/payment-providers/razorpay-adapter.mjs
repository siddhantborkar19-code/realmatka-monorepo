import { createHmac } from "node:crypto";
import { standaloneConfig } from "../../config.mjs";

const razorpayKeyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || "";
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || "";

function roundToPaise(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function buildCustomerEmail(user) {
  const phone = String(user?.phone || "").replace(/\D/g, "");
  return phone ? `${phone}@sdtwedding.com` : "customer@sdtwedding.com";
}

function buildCustomerContact(user) {
  const phone = String(user?.phone || "").replace(/\D/g, "");
  return phone ? `+91${phone}` : "";
}

function buildOrderNotes({ paymentOrderId, receipt, user }) {
  return {
    paymentOrderId,
    payment_order_id: paymentOrderId,
    reference: receipt,
    userId: user?.id || "",
    user_id: user?.id || "",
    userPhone: String(user?.phone || ""),
    user_name: String(user?.name || ""),
    customer_email: buildCustomerEmail(user)
  };
}

function getRazorpayAuthHeader() {
  return `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64")}`;
}

function getPaymentDescription() {
  return standaloneConfig.paymentDescription || "Wallet Top Up";
}

export function isRazorpayEnabled() {
  return Boolean(razorpayKeyId && razorpayKeySecret);
}

export function getRazorpayKeyId() {
  return razorpayKeyId;
}

export async function createRazorpayOrder({ amount, receipt, paymentOrderId, user }) {
  const amountPaise = roundToPaise(amount);

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: getRazorpayAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      payment_capture: 1,
      notes: buildOrderNotes({ paymentOrderId, receipt, user })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error?.description || payload?.description || "Unable to create Razorpay order");
  }

  return payload;
}

export async function createRazorpayPaymentLink({ amount, receipt, paymentOrderId, user }) {
  const amountPaise = roundToPaise(amount);
  const appReturnBase = (standaloneConfig.appUrl || "https://play.realmatka.in").replace(/\/$/, "");
  const callbackUrl = `${appReturnBase}/wallet/payment-success?referenceId=${encodeURIComponent(receipt)}&amount=${encodeURIComponent(
    (amountPaise / 100).toFixed(2)
  )}`;

  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: getRazorpayAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      upi_link: true,
      reference_id: receipt,
      description: getPaymentDescription(),
      callback_url: callbackUrl,
      callback_method: "get",
      customer: {
        name: user?.name || "Customer",
        contact: buildCustomerContact(user) || undefined,
        email: buildCustomerEmail(user)
      },
      notes: buildOrderNotes({ paymentOrderId, receipt, user })
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id || !payload?.short_url) {
    throw new Error(payload?.error?.description || payload?.description || "Unable to create Razorpay payment link");
  }

  return payload;
}

export async function fetchRazorpayPaymentLinkStatus(paymentLinkId) {
  if (!paymentLinkId || !isRazorpayEnabled()) {
    return null;
  }

  const response = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
    method: "GET",
    headers: {
      Authorization: getRazorpayAuthHeader(),
      "Content-Type": "application/json"
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error?.description || payload?.description || "Unable to fetch Razorpay payment link status");
  }

  return payload;
}

export async function fetchRazorpayOrderPayments(orderId) {
  if (!orderId || !isRazorpayEnabled()) {
    return null;
  }

  const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, {
    method: "GET",
    headers: {
      Authorization: getRazorpayAuthHeader(),
      "Content-Type": "application/json"
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.items)) {
    throw new Error(payload?.error?.description || payload?.description || "Unable to fetch Razorpay order payments");
  }

  return payload;
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const expected = createHmac("sha256", razorpayKeySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected === signature;
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  if (!razorpayWebhookSecret || !signature) {
    return false;
  }
  const expected = createHmac("sha256", razorpayWebhookSecret).update(rawBody).digest("hex");
  return expected === signature;
}

export function getRazorpayWebhookSecret() {
  return razorpayWebhookSecret;
}
