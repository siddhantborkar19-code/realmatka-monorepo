import { requireAuthenticatedUser } from "../middleware/auth-middleware.mjs";
import { corsPreflight, fail, getJsonBody, ok } from "../http.mjs";
import { standaloneConfig } from "../config.mjs";
import {
  completeCheckoutSession,
  createCashfreePaymentOrder,
  createHostedPaymentOrder,
  createNativePaymentOrder,
  confirmNativePaymentOrder,
  getDepositConfigSnapshot,
  getPaymentOrderStatusSnapshot,
  getUpiDepositEntry,
  processUpiNotificationCredit,
  processPaymentWebhook,
  reportUpiDepositEntry,
  resolveCheckoutSession,
  startUpiDepositEntry
} from "../services/payment-service.mjs";
import {
  createRazorpayOrder,
  createRazorpayPaymentLink,
  fetchRazorpayOrderPayments,
  fetchRazorpayPaymentLinkStatus,
  getRazorpayKeyId,
  getRazorpayWebhookSecret,
  isRazorpayEnabled,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature
} from "../services/payment-providers/razorpay-adapter.mjs";
import {
  createCashfreeOrder,
  fetchCashfreeOrderStatus,
  getCashfreeMode,
  isCashfreeEnabled,
  verifyCashfreeWebhookSignature
} from "../services/payment-providers/cashfree-adapter.mjs";

function getServerOrigin(request) {
  const requestUrl = new URL(request.url);
  const configuredOrigin =
    process.env.PAYMENTS_PUBLIC_ORIGIN?.trim() ||
    process.env.PUBLIC_API_ORIGIN?.trim() ||
    standaloneConfig.apiUrl;
  if (/^https?:\/\//i.test(configuredOrigin || "")) {
    return configuredOrigin.replace(/\/$/, "");
  }
  return requestUrl.origin.replace(/\/$/, "");
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

function buildHostedCheckoutHtml({ serverOrigin, paymentOrder, user, callbackUrl }) {
  const amountPaise = roundToPaise(paymentOrder.amount);
  const prefllPhone = user?.phone ? `+91${user.phone}` : "";
  const customerName = user?.name || "Customer";
  const displayName = standaloneConfig.paymentDisplayName || "SDT Wedding";
  const paymentDescription = standaloneConfig.paymentDescription || "Wallet Top Up";
  const pageTitle = `${displayName} ${paymentOrder.reference}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #0b0b0b; color: #fff; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
      .card { width: min(460px, calc(100vw - 32px)); background: #fff; color: #111; border-radius: 20px; padding: 28px; box-shadow: 0 30px 60px rgba(0,0,0,.35); }
      .eyebrow { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #666; }
      h1 { margin: 10px 0 8px; font-size: 28px; }
      p { margin: 0 0 14px; color: #555; line-height: 1.5; }
      .meta { background: #f5f5f5; border-radius: 14px; padding: 14px; margin: 18px 0; }
      .meta strong { display: block; font-size: 24px; color: #111; }
      button { width: 100%; min-height: 52px; border: 0; border-radius: 999px; background: #111; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
      .secondary { margin-top: 10px; background: #efefef; color: #111; }
      .help { margin-top: 16px; font-size: 13px; color: #666; text-align: center; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="eyebrow">Deposit</div>
      <h1>Complete Wallet Deposit</h1>
      <p>You will be redirected to Razorpay secure checkout. Complete the payment to update your wallet.</p>
      <div class="meta">
        <span>Amount</span>
        <strong>Rs. ${escapeHtml(paymentOrder.amount.toFixed(2))}</strong>
        <span>Reference: ${escapeHtml(paymentOrder.reference)}</span>
      </div>
      <button id="pay-now">Pay Now</button>
      <button id="retry" class="secondary" type="button">Retry Checkout</button>
      <div class="help">If the checkout does not open automatically, tap Pay Now again.</div>
    </div>

    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      const options = {
        key: ${JSON.stringify(razorpayKeyId)},
        amount: ${JSON.stringify(String(amountPaise))},
        currency: "INR",
        name: ${JSON.stringify(displayName)},
        description: ${JSON.stringify(paymentDescription)},
        order_id: ${JSON.stringify(paymentOrder.gatewayOrderId)},
        callback_url: ${JSON.stringify(callbackUrl)},
        redirect: true,
        prefill: {
          name: ${JSON.stringify(customerName)},
          contact: ${JSON.stringify(prefllPhone)}
        },
        notes: {
          reference: ${JSON.stringify(paymentOrder.reference)},
          payment_order_id: ${JSON.stringify(paymentOrder.id)}
        },
        theme: {
          color: "#111111"
        },
        modal: {
          ondismiss: function () {
            document.querySelector(".help").textContent = "Checkout closed. Tap Retry Checkout to try again.";
          }
        }
      };

      const openCheckout = function () {
        const checkout = new Razorpay(options);
        checkout.open();
      };

      document.getElementById("pay-now").addEventListener("click", function (event) {
        event.preventDefault();
        openCheckout();
      });

      document.getElementById("retry").addEventListener("click", function (event) {
        event.preventDefault();
        openCheckout();
      });

      window.addEventListener("load", function () {
        setTimeout(openCheckout, 250);
      });
    </script>
  </body>
</html>`;
}

function buildPaymentResultHtml({ title, message, actionLabel, actionHref }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b0b0b; font-family: Arial, sans-serif; color: #fff; }
      .card { width: min(420px, calc(100vw - 32px)); background: #fff; color: #111; border-radius: 20px; padding: 28px; text-align: center; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0 0 18px; color: #555; line-height: 1.5; }
      a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 20px; border-radius: 999px; background: #111; color: #fff; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>
    </div>
  </body>
</html>`;
}

function buildManualQrReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RM${Date.now()}${random}`;
}

function isManualQrWebCheckoutEnabled() {
  const platform = String(process.env.DEPOSIT_RAZORPAY_PLATFORM || "").trim().toLowerCase();
  const checkoutFlow = String(process.env.DEPOSIT_CHECKOUT_FLOW || "").trim().toLowerCase();
  return platform === "manual_qr_web" || checkoutFlow === "manual_qr_web";
}

function isExternalCheckoutEnabled() {
  const platform = String(process.env.DEPOSIT_RAZORPAY_PLATFORM || "").trim().toLowerCase();
  const checkoutFlow = String(process.env.DEPOSIT_CHECKOUT_FLOW || "").trim().toLowerCase();
  return ["external_checkout", "novabyte_checkout"].includes(platform) || ["external_checkout", "novabyte_checkout"].includes(checkoutFlow);
}

function isCashfreeDepositMode() {
  const mode = String(process.env.DEPOSIT_MODE || "").trim().toLowerCase();
  const checkoutFlow = String(process.env.DEPOSIT_CHECKOUT_FLOW || "").trim().toLowerCase();
  const platform = String(process.env.DEPOSIT_RAZORPAY_PLATFORM || "").trim().toLowerCase();
  return mode === "cashfree" || checkoutFlow === "cashfree" || platform === "cashfree_checkout";
}

function buildCashfreeCheckoutRedirectUrl({ referenceId, amount, paymentSessionId }) {
  const checkoutBase = String(process.env.DEPOSIT_EXTERNAL_CHECKOUT_URL || "https://www.novabytetech.in/checkout").trim();
  const url = new URL(checkoutBase);
  url.searchParams.set("reference", referenceId);
  url.searchParams.set("amount", Number(amount || 0).toFixed(2));
  url.searchParams.set("currency", "INR");
  url.searchParams.set("session", paymentSessionId);
  url.searchParams.set("mode", getCashfreeMode());
  return url.toString();
}

function buildExternalCheckoutRedirectUrl({ referenceId, amount }) {
  const checkoutBase = String(process.env.DEPOSIT_EXTERNAL_CHECKOUT_URL || "https://www.novabytetech.in/checkout").trim();
  const url = new URL(checkoutBase);
  url.searchParams.set("reference", referenceId);
  url.searchParams.set("amount", Number(amount || 0).toFixed(2));
  url.searchParams.set("currency", "INR");
  return url.toString();
}

function buildUpiPaymentUri({ upiId, upiName, amount }) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: upiName || "SDT WEDDING",
    mc: "0000",
    am: Number(amount || 0).toFixed(2),
    cu: "INR"
  });
  return `upi://pay?${params.toString()}`;
}

function buildManualQrRedirectUrl(request, { referenceId, amount }) {
  const serverOrigin = getServerOrigin(request);
  const url = new URL("/api/payments/manual-qr", serverOrigin);
  url.searchParams.set("referenceId", referenceId);
  url.searchParams.set("amount", Number(amount || 0).toFixed(2));
  return url.toString();
}

function buildManualQrOrderResponse({ entry, redirectUrl, amount, referenceId }) {
  return {
    id: entry?.id || referenceId,
    amount,
    provider: "manual_qr",
    reference: referenceId,
    redirectUrl,
    status: "INITIATED",
    remoteStatus: "INITIATED",
    checkoutMode: "link",
    gatewayOrderId: null,
    keyId: null,
    displayName: "SDT WEDDING",
    description: "Manual UPI QR Deposit",
    customerName: null,
    customerContact: null,
    customerEmail: null
  };
}

function buildExternalCheckoutOrderResponse({ entry, redirectUrl, amount, referenceId }) {
  return {
    id: entry?.id || referenceId,
    amount,
    provider: "external_checkout",
    reference: referenceId,
    redirectUrl,
    status: "INITIATED",
    remoteStatus: "INITIATED",
    checkoutMode: "link",
    gatewayOrderId: null,
    keyId: null,
    displayName: "NovaByte Technologies",
    description: "External checkout deposit request",
    customerName: null,
    customerContact: null,
    customerEmail: null
  };
}

function renderManualQrHtml({ amount, referenceId, upiId, upiName, whatsappNumber }) {
  const upiUri = buildUpiPaymentUri({ upiId, upiName, amount });
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=14&data=${encodeURIComponent(upiUri)}`;
  const whatsappPhone = String(whatsappNumber || "8446012081").replace(/\D/g, "");
  const normalizedPhone = whatsappPhone.startsWith("91") ? whatsappPhone : `91${whatsappPhone}`;
  const whatsappText = [
    "Wallet deposit payment proof",
    `Amount: Rs ${Number(amount || 0).toFixed(2)}`,
    `Reference: ${referenceId}`,
    `UPI ID: ${upiId}`,
    "",
    "Payment screenshot attached. Please verify and credit my wallet."
  ].join("\n");
  const whatsappUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(whatsappText)}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Manual UPI Deposit</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; font-family: Arial, sans-serif; background: linear-gradient(135deg, #fff7ed, #fef2f2); color: #171717; display: flex; align-items: center; justify-content: center; padding: 18px; }
      .card { width: min(430px, 100%); background: #fff; border-radius: 26px; padding: 22px; box-shadow: 0 24px 70px rgba(124, 45, 18, .18); border: 1px solid #fed7aa; }
      .brand { text-align: center; font-weight: 900; letter-spacing: .08em; color: #c2410c; font-size: 13px; text-transform: uppercase; }
      h1 { margin: 10px 0 6px; text-align: center; font-size: 26px; }
      .muted { color: #78716c; text-align: center; line-height: 1.45; margin: 0 0 16px; }
      .amount { border-radius: 18px; background: #fff7ed; padding: 12px; text-align: center; margin-bottom: 14px; }
      .amount span { display: block; color: #9a3412; font-size: 12px; font-weight: 800; text-transform: uppercase; }
      .amount strong { display: block; font-size: 32px; color: #7c2d12; margin-top: 2px; }
      .qr { display: flex; justify-content: center; padding: 14px; border-radius: 22px; background: #fafafa; border: 1px solid #e7e5e4; }
      .qr img { width: 260px; height: 260px; max-width: 100%; image-rendering: pixelated; }
      .meta { margin: 14px 0; display: grid; gap: 8px; }
      .row { border-radius: 14px; background: #f5f5f4; padding: 10px 12px; }
      .row span { display: block; color: #78716c; font-size: 11px; font-weight: 800; text-transform: uppercase; }
      .row strong { display: block; color: #1c1917; font-size: 15px; margin-top: 2px; word-break: break-all; }
      a.button { display: flex; align-items: center; justify-content: center; min-height: 50px; border-radius: 999px; text-decoration: none; color: #fff; background: #16a34a; font-weight: 900; margin-top: 12px; }
      .note { margin: 12px 0 0; color: #78716c; font-size: 13px; line-height: 1.45; text-align: center; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="brand">${escapeHtml(upiName || "SDT WEDDING")}</div>
      <h1>Scan QR & Pay</h1>
      <p class="muted">Pending deposit request create ho chuki hai. Payment complete karke screenshot WhatsApp par bhejein.</p>
      <div class="amount">
        <span>Pay Amount</span>
        <strong>Rs ${escapeHtml(Number(amount || 0).toFixed(2))}</strong>
      </div>
      <div class="qr"><img src="${escapeHtml(qrImageUrl)}" alt="UPI QR Code" /></div>
      <div class="meta">
        <div class="row"><span>UPI ID</span><strong>${escapeHtml(upiId)}</strong></div>
        <div class="row"><span>Deposit Reference</span><strong>${escapeHtml(referenceId)}</strong></div>
      </div>
      <a class="button" href="${escapeHtml(whatsappUrl)}">Send Screenshot on WhatsApp</a>
      <p class="note">Admin verify karne ke baad wallet balance credit hoga. Galat amount/reference par credit delay ho sakta hai.</p>
    </main>
  </body>
</html>`;
}

async function getCallbackPayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (/application\/x-www-form-urlencoded/i.test(contentType) || /multipart\/form-data/i.test(contentType)) {
    const form = await request.formData();
    return {
      razorpayPaymentId: String(form.get("razorpay_payment_id") ?? "").trim(),
      razorpayOrderId: String(form.get("razorpay_order_id") ?? "").trim(),
      razorpaySignature: String(form.get("razorpay_signature") ?? "").trim()
    };
  }

  const body = await getJsonBody(request);
  return {
    razorpayPaymentId: String(body.razorpay_payment_id ?? "").trim(),
    razorpayOrderId: String(body.razorpay_order_id ?? "").trim(),
    razorpaySignature: String(body.razorpay_signature ?? "").trim()
  };
}

export function options(request) {
  return corsPreflight(request);
}

export async function depositConfig(request) {
  return ok(getDepositConfigSnapshot(), request);
}

export async function createOrder(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = await getJsonBody(request);
  const amount = Number(body.amount ?? 0);
  const platform = String(body.platform ?? "web").trim().toLowerCase();

  if (isCashfreeDepositMode()) {
    if (!isCashfreeEnabled()) {
      return fail("Cashfree keys are not configured", 503, request);
    }
    const result = await createCashfreePaymentOrder({
      user,
      amount,
      createOrder: ({ amount: orderAmount, receipt, paymentOrderId, user: paymentUser }) =>
        createCashfreeOrder({
          amount: orderAmount,
          receipt,
          paymentOrderId,
          user: paymentUser
        }),
      getCheckoutUrl: ({ reference, amount: checkoutAmount, paymentSessionId }) =>
        buildCashfreeCheckoutRedirectUrl({
          referenceId: reference,
          amount: checkoutAmount,
          paymentSessionId
        })
    });
    if (!result.ok) {
      return fail(result.error, result.status, request);
    }
    return ok(result.data, request);
  }

  if (isExternalCheckoutEnabled()) {
    const referenceId = buildManualQrReference();
    const result = await startUpiDepositEntry({
      userId: user.id,
      amount,
      appName: "External Checkout",
      referenceId
    });
    if (!result.ok) {
      return fail(result.error, result.status, request);
    }
    const redirectUrl = buildExternalCheckoutRedirectUrl({ referenceId, amount });
    return ok(buildExternalCheckoutOrderResponse({ entry: result.data, redirectUrl, amount, referenceId }), request);
  }

  if (isManualQrWebCheckoutEnabled()) {
    const referenceId = buildManualQrReference();
    const result = await startUpiDepositEntry({
      userId: user.id,
      amount,
      appName: "Manual QR Web",
      referenceId
    });
    if (!result.ok) {
      return fail(result.error, result.status, request);
    }
    const redirectUrl = buildManualQrRedirectUrl(request, { referenceId, amount });
    return ok(buildManualQrOrderResponse({ entry: result.data, redirectUrl, amount, referenceId }), request);
  }

  if (!isRazorpayEnabled()) {
    return fail("Razorpay test mode keys are not configured", 503, request);
  }

  const result =
    platform === "web"
      ? await createHostedPaymentOrder({
          user,
          amount,
          createPaymentLink: ({ amountPaise, receipt, paymentOrderId, user: paymentUser }) =>
            createRazorpayPaymentLink({
              amount: amountPaise / 100,
              receipt,
              paymentOrderId,
              user: paymentUser
            })
        })
      : await createNativePaymentOrder({
          user,
          amount,
          createOrder: ({ amountPaise, receipt, paymentOrderId, user: paymentUser }) =>
            createRazorpayOrder({
              amount: amountPaise / 100,
              receipt,
              paymentOrderId,
              user: paymentUser
            }),
          getKeyId: getRazorpayKeyId
        });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}

export async function manualQrPage(request) {
  const url = new URL(request.url);
  const config = getDepositConfigSnapshot();
  const amount = Number(url.searchParams.get("amount") || 0);
  const referenceId = String(url.searchParams.get("referenceId") || "").trim();

  if (!referenceId || !Number.isFinite(amount) || amount <= 0) {
    return renderHtml(
      buildPaymentResultHtml({
        title: "Invalid Deposit Link",
        message: "Deposit QR link valid nahi hai. App me wapas jaakar dobara Pay Karo dabao.",
        actionLabel: "Back to App",
        actionHref: "realmatka://wallet/add-fund"
      }),
      400
    );
  }

  return renderHtml(
    renderManualQrHtml({
      amount,
      referenceId,
      upiId: config.upiId,
      upiName: config.upiName,
      whatsappNumber: config.whatsappNumber
    })
  );
}

export async function confirmOrder(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = await getJsonBody(request);
  const referenceId = String(body.referenceId ?? body.reference ?? "").trim();
  const payload = {
    razorpayPaymentId: String(body.razorpayPaymentId ?? body.razorpay_payment_id ?? "").trim(),
    razorpayOrderId: String(body.razorpayOrderId ?? body.razorpay_order_id ?? "").trim(),
    razorpaySignature: String(body.razorpaySignature ?? body.razorpay_signature ?? "").trim()
  };

  if (
    !verifyRazorpaySignature({
      orderId: payload.razorpayOrderId,
      paymentId: payload.razorpayPaymentId,
      signature: payload.razorpaySignature
    })
  ) {
    return fail("Payment signature could not be verified", 400, request);
  }

  const result = await confirmNativePaymentOrder({
    userId: user.id,
    referenceId,
    payload
  });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}

export async function getPaymentOrderStatus(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = request.method.toUpperCase() === "GET" ? getRequestParams(request) : await getJsonBody(request);
  const referenceId = String(body.referenceId ?? body.reference ?? "").trim();
  try {
    const result = await getPaymentOrderStatusSnapshot({
      userId: user.id,
      referenceId,
      isProviderEnabled: isRazorpayEnabled() || isCashfreeEnabled(),
      fetchPaymentLinkStatus: fetchRazorpayPaymentLinkStatus,
      fetchOrderPayments: fetchRazorpayOrderPayments,
      fetchCashfreeOrderStatus
    });
    if (!result.ok) {
      return fail(result.error, result.status, request);
    }
    return ok(result.data, request);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to verify payment status", 502, request);
  }
}

function getRequestParams(request) {
  const url = new URL(request.url);
  return Object.fromEntries(url.searchParams.entries());
}

export async function startUpiDeposit(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = request.method.toUpperCase() === "GET" ? getRequestParams(request) : await getJsonBody(request);
  const result = await startUpiDepositEntry({
    userId: user.id,
    amount: Number(body.amount ?? 0),
    appName: String(body.appName ?? "UPI").trim() || "UPI",
    referenceId: String(body.referenceId ?? "").trim()
  });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}

export async function reportUpiDeposit(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = request.method.toUpperCase() === "GET" ? getRequestParams(request) : await getJsonBody(request);
  const result = await reportUpiDepositEntry({
    userId: user.id,
    referenceId: String(body.referenceId ?? "").trim(),
    appName: String(body.appName ?? "UPI").trim() || "UPI",
    rawResponse: String(body.rawResponse ?? "").trim(),
    utr: String(body.utr ?? "").trim(),
    appReportedStatus: String(body.appReportedStatus ?? "").trim().toUpperCase()
  });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}

export async function getUpiDepositStatus(request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = request.method.toUpperCase() === "GET" ? getRequestParams(request) : await getJsonBody(request);
  const result = await getUpiDepositEntry({
    userId: user.id,
    referenceId: String(body.referenceId ?? "").trim()
  });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}

export async function upiAutoCreditWebhook(request) {
  const expectedSecret = String(process.env.UPI_AUTO_CREDIT_SECRET || "").trim();
  const providedSecret = String(request.headers.get("x-upi-listener-secret") || request.headers.get("x-webhook-secret") || "").trim();
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return fail("Unauthorized UPI listener webhook", 401, request);
  }

  const body = await getJsonBody(request);
  const result = await processUpiNotificationCredit({
    amount: Number(body.amount ?? 0),
    utr: String(body.utr ?? body.reference ?? "").trim(),
    referenceId: String(body.referenceId ?? body.depositReference ?? "").trim(),
    appName: String(body.appName ?? body.packageName ?? "UPI_NOTIFICATION").trim(),
    rawText: String(body.rawText ?? body.text ?? "").trim()
  });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}

export async function checkoutPage(request) {
  const url = new URL(request.url);
  const paymentOrderId = String(url.searchParams.get("paymentOrderId") ?? "").trim();
  const checkoutToken = String(url.searchParams.get("token") ?? "").trim();
  const result = await resolveCheckoutSession({ paymentOrderId, checkoutToken });
  if (!result.ok) {
    return renderHtml(buildPaymentResultHtml({
      title: "Invalid Payment Link",
      message: "This deposit session is invalid or has expired. Please start a new payment from the app.",
      actionLabel: "Back to Website",
      actionHref: standaloneConfig.appUrl || "https://play.realmatka.in"
    }), 404);
  }

  const { paymentOrder, user } = result.data;
  const serverOrigin = getServerOrigin(request);
  const callbackUrl = `${serverOrigin}/payments/callback?paymentOrderId=${encodeURIComponent(paymentOrder.id)}&token=${encodeURIComponent(checkoutToken)}&platform=${encodeURIComponent(
    String(url.searchParams.get("platform") ?? "web").trim().toLowerCase()
  )}`;

  return renderHtml(buildHostedCheckoutHtml({ serverOrigin, paymentOrder, user, callbackUrl }));
}

export async function callbackPage(request) {
  const url = new URL(request.url);
  const paymentOrderId = String(url.searchParams.get("paymentOrderId") ?? "").trim();
  const checkoutToken = String(url.searchParams.get("token") ?? "").trim();
  const platform = String(url.searchParams.get("platform") ?? "web").trim().toLowerCase();
  const checkoutResult = await resolveCheckoutSession({ paymentOrderId, checkoutToken });
  if (!checkoutResult.ok) {
    return renderHtml(
      buildPaymentResultHtml({
        title: "Payment Session Invalid",
        message: "This payment session could not be verified. Please start a fresh deposit request.",
        actionLabel: "Back to Website",
        actionHref: standaloneConfig.appUrl || "https://play.realmatka.in"
      }),
      404
    );
  }
  const { paymentOrder } = checkoutResult.data;

  const payload = await getCallbackPayload(request);
  if (!payload.razorpayPaymentId || !payload.razorpayOrderId || !payload.razorpaySignature) {
    return renderHtml(
      buildPaymentResultHtml({
        title: "Payment Incomplete",
        message: "Razorpay did not return a valid payment confirmation. Please retry the deposit.",
        actionLabel: "Retry Deposit",
        actionHref: paymentOrder.redirectUrl || standaloneConfig.appUrl || "https://play.realmatka.in"
      }),
      400
    );
  }

  if (!verifyRazorpaySignature({
    orderId: payload.razorpayOrderId,
    paymentId: payload.razorpayPaymentId,
    signature: payload.razorpaySignature
  })) {
    return renderHtml(
      buildPaymentResultHtml({
        title: "Payment Verification Failed",
        message: "The payment signature could not be verified. Your wallet was not credited.",
        actionLabel: "Back to Website",
        actionHref: standaloneConfig.appUrl || "https://play.realmatka.in"
      }),
      400
    );
  }

  const completionResult = await completeCheckoutSession({
    paymentOrderId,
    checkoutToken,
    payload
  });
  if (!completionResult.ok) {
    return renderHtml(
      buildPaymentResultHtml({
        title: "Payment Session Invalid",
        message: completionResult.error,
        actionLabel: "Back to Website",
        actionHref: standaloneConfig.appUrl || "https://play.realmatka.in"
      }),
      completionResult.status
    );
  }

  const webReturnUrl = `${(standaloneConfig.appUrl || "https://play.realmatka.in").replace(/\/$/, "")}/wallet/history?payment=success&reference=${encodeURIComponent(
    paymentOrder.reference
  )}`;

  if (platform === "web") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: webReturnUrl
      }
    });
  }

  return renderHtml(
    buildPaymentResultHtml({
      title: "Payment Successful",
      message: "Your wallet has been credited. You can now return to the app and refresh your wallet history.",
      actionLabel: "Open Web Wallet",
      actionHref: webReturnUrl
    })
  );
}

export async function webhook(request) {
  const rawBody = await request.text();
  const cashfreeSignature = request.headers.get("x-webhook-signature")?.trim() || "";
  const cashfreeTimestamp = request.headers.get("x-webhook-timestamp")?.trim() || "";
  const signature = request.headers.get("x-razorpay-signature")?.trim() || "";

  if (cashfreeSignature || cashfreeTimestamp) {
    if (!isCashfreeEnabled()) {
      return fail("Cashfree keys are not configured", 503, request);
    }
    if (!verifyCashfreeWebhookSignature(rawBody, cashfreeSignature, cashfreeTimestamp)) {
      return fail("Invalid Cashfree webhook signature", 400, request);
    }

    let body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return fail("Invalid Cashfree webhook payload", 400, request);
    }

    const eventType = String(body?.type || body?.event || "").trim().toUpperCase();
    const orderEntity = body?.data?.order || body?.order || {};
    const paymentEntity = body?.data?.payment || body?.payment || {};
    const reference = String(orderEntity?.order_id || body?.order_id || "").trim();
    const paymentStatus = String(paymentEntity?.payment_status || orderEntity?.order_status || "").trim().toUpperCase();
    const paymentOrderId = String(orderEntity?.order_tags?.paymentOrderId || body?.paymentOrderId || "").trim();
    const gatewayPaymentId = String(
      paymentEntity?.cf_payment_id ||
        paymentEntity?.payment_id ||
        orderEntity?.cf_order_id ||
        reference
    ).trim();
    const gatewayOrderId = reference;
    const event =
      paymentStatus === "SUCCESS" || paymentStatus === "PAID" || eventType === "PAYMENT_SUCCESS_WEBHOOK"
        ? "payment_link.paid"
        : paymentStatus === "FAILED" || eventType === "PAYMENT_FAILED_WEBHOOK"
          ? "payment.failed"
          : ["EXPIRED", "TERMINATED", "TERMINATION_REQUESTED", "CANCELLED"].includes(paymentStatus)
            ? paymentStatus === "EXPIRED"
              ? "payment_link.expired"
              : "payment_link.cancelled"
            : eventType || "cashfree.ignored";

    const result = await processPaymentWebhook({
      event,
      paymentOrderId,
      reference,
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature: "cashfree_webhook"
    });
    if (!result.ok) {
      return fail(result.error, result.status, request);
    }
    return ok(result.data, request);
  }

  if (!getRazorpayWebhookSecret()) {
    return fail("Razorpay webhook secret is not configured", 503, request);
  }

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return fail("Invalid webhook signature", 400, request);
  }

  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return fail("Invalid webhook payload", 400, request);
  }

  const event = String(body?.event || "").trim();
  const paymentLinkEntity = body?.payload?.payment_link?.entity || {};
  const orderEntity = body?.payload?.order?.entity || {};
  const paymentEntity = body?.payload?.payment?.entity || {};
  const paymentNotes = paymentEntity?.notes || {};
  const paymentLinkNotes = paymentLinkEntity?.notes || {};
  const reference =
    String(paymentLinkEntity.reference_id || paymentLinkEntity.reference || orderEntity.receipt || paymentNotes.reference || "").trim();
  const paymentOrderId =
    String(paymentNotes.paymentOrderId || paymentLinkNotes.paymentOrderId || "").trim();
  const gatewayOrderId =
    String(paymentLinkEntity.id || paymentLinkEntity.order_id || paymentEntity.order_id || orderEntity.order_id || orderEntity.id || "").trim();
  const gatewayPaymentId =
    String(paymentEntity.id || paymentLinkEntity.payments?.[0]?.payment_id || paymentLinkEntity.payments?.[0]?.id || orderEntity.payment_id || orderEntity.id || "").trim();
  const result = await processPaymentWebhook({
    event,
    paymentOrderId,
    reference,
    gatewayOrderId,
    gatewayPaymentId,
    gatewaySignature: signature
  });
  if (!result.ok) {
    return fail(result.error, result.status, request);
  }
  return ok(result.data, request);
}
