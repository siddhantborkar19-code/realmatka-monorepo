import {
  addWalletEntry,
  completePaymentLinkOrder,
  completePaymentOrder,
  createPaymentOrder,
  findPendingPaymentOrdersForUser,
  findPaymentOrderByReferenceForUser,
  findPaymentOrderForCheckout,
  findUserById,
  findWalletEntryByReferenceId,
  getUserBalance,
  handlePaymentWebhook,
  updateWalletEntryAdmin
} from "../stores/payment-store.mjs";
import { standaloneConfig } from "../config.mjs";

function roundToPaise(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function getConfiguredDepositMinAmount() {
  const value = Number(process.env.DEPOSIT_MIN_AMOUNT || 100);
  return Math.max(1, Number.isFinite(value) ? value : 100);
}

function validateDepositAmount(amountPaise) {
  const minAmount = getConfiguredDepositMinAmount();
  if (amountPaise < roundToPaise(minAmount)) {
    return `Minimum deposit is Rs. ${minAmount}`;
  }
  return "";
}

function readBooleanEnv(name, fallback = true) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return !["0", "false", "no", "off", "disabled"].includes(raw);
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function getDepositConfigSnapshot() {
  const allowedModes = new Set(["manual_qr", "maintenance", "razorpay", "upi_intent"]);
  const configuredMode = String(process.env.DEPOSIT_MODE || "manual_qr").trim().toLowerCase();
  const mode = allowedModes.has(configuredMode) ? configuredMode : "manual_qr";
  const minAmount = getConfiguredDepositMinAmount();
  const upiId = String(process.env.DEPOSIT_UPI_ID || process.env.EXPO_PUBLIC_DIRECT_UPI_ID || "s7568539842258141@slc").trim();
  const upiName = String(process.env.DEPOSIT_UPI_NAME || process.env.EXPO_PUBLIC_DIRECT_UPI_NAME || "slice").trim();
  const whatsappNumber = String(process.env.DEPOSIT_WHATSAPP_PHONE || process.env.EXPO_PUBLIC_PAYMENT_WHATSAPP_PHONE || "8446012081").replace(/\D/g, "");

  return {
    version: 1,
    enabled: readBooleanEnv("DEPOSIT_ENABLED", true),
    mode,
    minAmount,
    upiId,
    upiName,
    whatsappNumber,
    razorpayPlatform: String(process.env.DEPOSIT_RAZORPAY_PLATFORM || "web").trim().toLowerCase() === "native" ? "native" : "web",
    title: String(process.env.DEPOSIT_TITLE || "Add Fund").trim(),
    message: String(
      process.env.DEPOSIT_MESSAGE ||
        "Amount enter karke QR generate karein, payment complete karein, aur screenshot WhatsApp par bhejein."
    ).trim(),
    maintenanceTitle: String(process.env.DEPOSIT_MAINTENANCE_TITLE || "Deposit temporarily manual").trim(),
    maintenanceMessage: String(
      process.env.DEPOSIT_MAINTENANCE_MESSAGE ||
        "Technical update ke kaaran deposit flow temporarily manual hai. Kripya latest APK use karein."
    ).trim(),
    updatedAt: new Date().toISOString()
  };
}

function buildCheckoutCustomer(user) {
  const phone = String(user?.phone || "").replace(/\D/g, "");
  return {
    name: String(user?.name || "Customer"),
    contact: phone ? `+91${phone}` : "",
    email: phone ? `${phone}@sdtwedding.com` : "customer@sdtwedding.com"
  };
}

function normalizeUpiClientStatus(value) {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "SUCCESS" || status === "SUBMITTED") {
    return "INITIATED";
  }
  if (status === "FAILED") {
    return "FAILED";
  }
  if (status === "CANCELLED") {
    return "CANCELLED";
  }
  return "";
}

function normalizeUtr(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function parseUpiAmount(value) {
  const text = String(value || "");
  const match = text.match(/(?:rs\.?|inr|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/i) || text.match(/\b([0-9]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|₹)/i);
  return match ? Number(match[1]) : 0;
}

function parseUpiUtr(value) {
  const text = String(value || "");
  const match =
    text.match(/\b(?:utr|upi\s*ref(?:erence)?|ref(?:erence)?\s*no\.?|txn(?:\.|action)?\s*id)\s*[:#-]?\s*([A-Z0-9]{8,24})\b/i) ||
    text.match(/\b([0-9]{10,18})\b/);
  return normalizeUtr(match?.[1] || "");
}

function parseDepositReference(value) {
  const match = String(value || "").match(/\b(RM[A-Z0-9]{6,20})\b/i);
  return match ? String(match[1]).trim().toUpperCase() : "";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getUpiAutoCreditWindowMs() {
  const minutes = Number(process.env.UPI_AUTO_CREDIT_WINDOW_MINUTES || 45);
  return Math.max(5, Math.min(180, Number.isFinite(minutes) ? minutes : 45)) * 60 * 1000;
}

function getLatestPaymentLinkAttemptStatus(paymentLink) {
  const items = Array.isArray(paymentLink?.payments) ? paymentLink.payments : [];
  if (!items.length) {
    return "";
  }

  const latest = items[items.length - 1];
  return String(latest?.status || "").trim().toLowerCase();
}

function getSuccessfulPaymentLinkPaymentId(paymentLink, expectedAmount) {
  const expectedAmountPaise = roundToPaise(expectedAmount);
  const directPaymentId = String(paymentLink?.payment_id || "").trim();
  const directAmountPaid = Number(paymentLink?.amount_paid ?? 0);
  if (directPaymentId && directAmountPaid === expectedAmountPaise) {
    return directPaymentId;
  }

  const items = Array.isArray(paymentLink?.payments) ? paymentLink.payments : [];
  const successfulAttempt = items.find((item) => {
    const status = String(item?.status || "").trim().toLowerCase();
    const paymentId = String(item?.payment_id || item?.id || "").trim();
    const amountPaise = Number(item?.amount ?? item?.amount_paid ?? 0);
    return status === "captured" && paymentId && amountPaise === expectedAmountPaise;
  });

  return String(successfulAttempt?.payment_id || successfulAttempt?.id || "").trim();
}

export async function createHostedPaymentOrder({ user, amount, createPaymentLink }) {
  const amountPaise = roundToPaise(amount);
  const validationError = validateDepositAmount(amountPaise);
  if (validationError) {
    return { ok: false, status: 400, error: validationError };
  }

  const paymentOrderId = `payment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const reference = `RM${Date.now()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`.slice(0, 40);
  const checkoutToken = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const paymentLink = await createPaymentLink({
    amountPaise,
    receipt: reference,
    paymentOrderId,
    user
  });

  const order = await createPaymentOrder({
    id: paymentOrderId,
    userId: user.id,
    amount,
    provider: "razorpay_payment_link",
    reference,
    checkoutToken,
    gatewayOrderId: paymentLink.id,
    redirectUrl: paymentLink.short_url
  });

  return { ok: true, data: order };
}

export async function createNativePaymentOrder({ user, amount, createOrder, getKeyId }) {
  const amountPaise = roundToPaise(amount);
  const validationError = validateDepositAmount(amountPaise);
  if (validationError) {
    return { ok: false, status: 400, error: validationError };
  }

  const paymentOrderId = `payment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const reference = `RM${Date.now()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`.slice(0, 40);
  const checkoutToken = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  const gatewayOrder = await createOrder({
    amountPaise,
    receipt: reference,
    paymentOrderId,
    user
  });

  const order = await createPaymentOrder({
    id: paymentOrderId,
    userId: user.id,
    amount,
    provider: "razorpay_checkout",
    reference,
    checkoutToken,
    gatewayOrderId: gatewayOrder.id,
    redirectUrl: null
  });

  return {
    ok: true,
    data: {
      ...order,
      checkoutMode: "native",
      gatewayOrderId: gatewayOrder.id,
      keyId: getKeyId(),
      displayName: standaloneConfig.paymentDisplayName || "SDT Wedding",
      description: standaloneConfig.paymentDescription || "Wallet Top Up",
      customerName: buildCheckoutCustomer(user).name,
      customerContact: buildCheckoutCustomer(user).contact,
      customerEmail: buildCheckoutCustomer(user).email
    }
  };
}

export async function getPaymentOrderStatusSnapshot({ userId, referenceId, isProviderEnabled, fetchPaymentLinkStatus, fetchOrderPayments }) {
  if (!referenceId) {
    return { ok: false, status: 400, error: "referenceId is required" };
  }

  let order = await findPaymentOrderByReferenceForUser(userId, referenceId);
  if (!order) {
    return { ok: false, status: 404, error: "Payment order not found" };
  }

  if (order.status === "PENDING" && order.provider === "razorpay_payment_link" && order.gatewayOrderId && isProviderEnabled) {
    const paymentLink = await fetchPaymentLinkStatus(order.gatewayOrderId);
    const remoteStatus = String(paymentLink?.status || "").trim().toLowerCase();
    const latestAttemptStatus = getLatestPaymentLinkAttemptStatus(paymentLink);
    const successfulPaymentId = getSuccessfulPaymentLinkPaymentId(paymentLink, order.amount);

    if (remoteStatus === "paid" && successfulPaymentId) {
      order = await completePaymentLinkOrder({
        reference: order.reference,
        gatewayOrderId: String(order.gatewayOrderId || paymentLink.id || "").trim(),
        gatewayPaymentId: successfulPaymentId,
        gatewaySignature: "payment_link_status_poll"
      });
    } else if (latestAttemptStatus === "failed") {
      order = await handlePaymentWebhook({
        paymentOrderId: order.id,
        reference: order.reference,
        gatewayOrderId: String(order.gatewayOrderId || paymentLink.id || "").trim(),
        status: "FAILED"
      });
    } else if (remoteStatus === "cancelled") {
      order = await handlePaymentWebhook({
        paymentOrderId: order.id,
        reference: order.reference,
        gatewayOrderId: String(order.gatewayOrderId || paymentLink.id || "").trim(),
        status: "CANCELLED"
      });
    } else if (remoteStatus === "expired") {
      order = await handlePaymentWebhook({
        paymentOrderId: order.id,
        reference: order.reference,
        gatewayOrderId: String(order.gatewayOrderId || paymentLink.id || "").trim(),
        status: "EXPIRED"
      });
    } else {
      order = {
        ...order,
        remoteStatus: latestAttemptStatus || remoteStatus || "created"
      };
    }
  }

  if (order.status === "PENDING" && order.provider === "razorpay_checkout" && order.gatewayOrderId && isProviderEnabled && typeof fetchOrderPayments === "function") {
    const orderPayments = await fetchOrderPayments(order.gatewayOrderId);
    const successfulPayment = getSuccessfulRazorpayOrderPayment(orderPayments, order.amount);
    const latestPayment = getLatestRazorpayOrderPayment(orderPayments);
    const latestStatus = String(latestPayment?.status || "").trim().toLowerCase();

    if (successfulPayment?.id) {
      order = await completePaymentOrder({
        paymentOrderId: order.id,
        gatewayOrderId: String(order.gatewayOrderId).trim(),
        gatewayPaymentId: String(successfulPayment.id).trim(),
        gatewaySignature: "checkout_status_poll"
      });
    } else if (latestStatus === "failed") {
      order = await handlePaymentWebhook({
        paymentOrderId: order.id,
        reference: order.reference,
        gatewayOrderId: String(order.gatewayOrderId).trim(),
        status: "FAILED"
      });
    } else {
      order = {
        ...order,
        remoteStatus: latestStatus || "created"
      };
    }
  }

  return { ok: true, data: order };
}

function getLatestRazorpayOrderPayment(orderPaymentsPayload) {
  const items = Array.isArray(orderPaymentsPayload?.items) ? orderPaymentsPayload.items : [];
  return items.length ? items[items.length - 1] : null;
}

function getSuccessfulRazorpayOrderPayment(orderPaymentsPayload, expectedAmount) {
  const items = Array.isArray(orderPaymentsPayload?.items) ? orderPaymentsPayload.items : [];
  const expectedAmountPaise = roundToPaise(expectedAmount);
  return (
    items.find((item) => {
      const status = String(item?.status || "").trim().toLowerCase();
      const amountPaise = Number(item?.amount ?? 0);
      return status === "captured" && amountPaise === expectedAmountPaise;
    }) || null
  );
}

export async function reconcilePendingPaymentOrdersForUser({
  userId,
  isProviderEnabled,
  fetchPaymentLinkStatus,
  fetchOrderPayments,
  limit = 5
}) {
  if (!userId || !isProviderEnabled) {
    return [];
  }

  const pendingOrders = await findPendingPaymentOrdersForUser(userId, limit);
  const reconciled = [];

  for (const order of pendingOrders) {
    try {
      if (order.provider === "razorpay_payment_link" && order.gatewayOrderId) {
        const paymentLink = await fetchPaymentLinkStatus(order.gatewayOrderId);
        const remoteStatus = String(paymentLink?.status || "").trim().toLowerCase();
        const latestAttemptStatus = getLatestPaymentLinkAttemptStatus(paymentLink);
        const successfulPaymentId = getSuccessfulPaymentLinkPaymentId(paymentLink, order.amount);

        if (remoteStatus === "paid" && successfulPaymentId) {
          const updated = await completePaymentLinkOrder({
            reference: order.reference,
            gatewayOrderId: String(order.gatewayOrderId || paymentLink.id || "").trim(),
            gatewayPaymentId: successfulPaymentId,
            gatewaySignature: "payment_link_background_reconcile"
          });
          if (updated) {
            reconciled.push(updated);
          }
          continue;
        }

        if (latestAttemptStatus === "failed") {
          const updated = await handlePaymentWebhook({
            paymentOrderId: order.id,
            reference: order.reference,
            gatewayOrderId: String(order.gatewayOrderId || paymentLink.id || "").trim(),
            status: "FAILED"
          });
          if (updated) {
            reconciled.push(updated);
          }
          continue;
        }

        if (remoteStatus === "cancelled" || remoteStatus === "expired") {
          const updated = await handlePaymentWebhook({
            paymentOrderId: order.id,
            reference: order.reference,
            gatewayOrderId: String(order.gatewayOrderId || paymentLink.id || "").trim(),
            status: remoteStatus === "cancelled" ? "CANCELLED" : "EXPIRED"
          });
          if (updated) {
            reconciled.push(updated);
          }
        }
        continue;
      }

      if (order.provider === "razorpay_checkout" && order.gatewayOrderId) {
        const orderPayments = await fetchOrderPayments(order.gatewayOrderId);
        const successfulPayment = getSuccessfulRazorpayOrderPayment(orderPayments, order.amount);
        if (successfulPayment?.id) {
          const updated = await completePaymentOrder({
            paymentOrderId: order.id,
            gatewayOrderId: String(order.gatewayOrderId).trim(),
            gatewayPaymentId: String(successfulPayment.id).trim(),
            gatewaySignature: "checkout_background_reconcile"
          });
          if (updated) {
            reconciled.push(updated);
          }
        }
      }
    } catch {
      // Ignore transient provider errors during background reconciliation.
    }
  }

  return reconciled;
}

export async function confirmNativePaymentOrder({ userId, referenceId, payload }) {
  if (!referenceId) {
    return { ok: false, status: 400, error: "referenceId is required" };
  }

  if (!payload?.razorpayPaymentId || !payload?.razorpayOrderId || !payload?.razorpaySignature) {
    return { ok: false, status: 400, error: "Payment confirmation payload is incomplete" };
  }

  const order = await findPaymentOrderByReferenceForUser(userId, referenceId);
  if (!order) {
    return { ok: false, status: 404, error: "Payment order not found" };
  }

  const updatedOrder = await completePaymentOrder({
    paymentOrderId: order.id,
    gatewayOrderId: payload.razorpayOrderId,
    gatewayPaymentId: payload.razorpayPaymentId,
    gatewaySignature: payload.razorpaySignature
  });

  return { ok: true, data: updatedOrder ?? order };
}

export async function startUpiDepositEntry({ userId, amount, appName, referenceId }) {
  const minAmount = getConfiguredDepositMinAmount();
  if (amount < minAmount) {
    return { ok: false, status: 400, error: `Minimum deposit is Rs. ${minAmount}` };
  }
  if (!referenceId) {
    return { ok: false, status: 400, error: "referenceId is required" };
  }

  const existing = await findWalletEntryByReferenceId(userId, referenceId);
  if (existing) {
    return { ok: true, data: existing };
  }

  const beforeBalance = await getUserBalance(userId);
  const entry = await addWalletEntry({
    userId,
    type: "DEPOSIT",
    status: "INITIATED",
    amount,
    beforeBalance,
    afterBalance: beforeBalance,
    referenceId,
    note: JSON.stringify({
      channel: "upi_intent",
      appName,
      appReportedStatus: "STARTED"
    })
  });

  return { ok: true, data: entry };
}

export async function reportUpiDepositEntry({ userId, referenceId, appName, rawResponse, utr, appReportedStatus }) {
  if (!referenceId) {
    return { ok: false, status: 400, error: "referenceId is required" };
  }
  const mappedStatus = normalizeUpiClientStatus(appReportedStatus);
  if (!mappedStatus) {
    return { ok: false, status: 400, error: "Unsupported appReportedStatus" };
  }

  const existing = await findWalletEntryByReferenceId(userId, referenceId);
  if (!existing) {
    return { ok: false, status: 404, error: "Deposit request not found" };
  }

  const nextNote = [
    `UPI App: ${appName}`,
    `Client Status: ${String(appReportedStatus ?? "").trim().toUpperCase()}`,
    utr ? `UTR: ${utr}` : "",
    rawResponse ? `Raw: ${rawResponse}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  const updated = await updateWalletEntryAdmin(existing.id, {
    status: mappedStatus,
    referenceId,
    note: nextNote
  });

  return { ok: true, data: updated };
}

export async function getUpiDepositEntry({ userId, referenceId }) {
  if (!referenceId) {
    return { ok: false, status: 400, error: "referenceId is required" };
  }

  const existing = await findWalletEntryByReferenceId(userId, referenceId);
  if (!existing) {
    return { ok: false, status: 404, error: "Deposit request not found" };
  }

  return { ok: true, data: existing };
}

export async function processUpiNotificationCredit({ amount, utr, appName, rawText, referenceId }) {
  const normalizedUtr = normalizeUtr(utr) || parseUpiUtr(rawText);
  const normalizedAmount = roundMoney(Number(amount || 0) || parseUpiAmount(rawText));
  const normalizedReferenceId = String(referenceId || "").trim().toUpperCase() || parseDepositReference(rawText);
  const normalizedAppName = String(appName || "UPI_NOTIFICATION").trim() || "UPI_NOTIFICATION";
  const raw = String(rawText || "").trim();

  if (!normalizedUtr) {
    return { ok: false, status: 400, error: "UTR not found in notification" };
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < getConfiguredDepositMinAmount()) {
    return { ok: false, status: 400, error: "Valid amount not found in notification" };
  }

  const { getWalletApprovalRequests, getWalletRequestHistory, resolveWalletApprovalRequest, updateWalletEntryAdmin } = await import("../db/wallet-db.mjs");
  const allPendingDeposits = (await getWalletApprovalRequests()).filter((entry) => entry.type === "DEPOSIT" && entry.status === "INITIATED");
  const pendingDeposits = allPendingDeposits.filter((entry) => {
    if (entry.type !== "DEPOSIT" || entry.status !== "INITIATED") {
      return false;
    }
    if (normalizedReferenceId && String(entry.referenceId || "").trim().toUpperCase() !== normalizedReferenceId) {
      return false;
    }
    if (roundMoney(entry.amount) !== normalizedAmount) {
      return false;
    }
    const createdAt = new Date(entry.createdAt || "").getTime();
    return Number.isFinite(createdAt) && createdAt >= Date.now() - getUpiAutoCreditWindowMs();
  });

  const alreadyUsed = (await getWalletRequestHistory()).some((entry) => {
    const note = String(entry.note || "").toUpperCase();
    return note.includes(`UTR: ${normalizedUtr}`);
  });
  if (alreadyUsed) {
    return { ok: false, status: 409, error: "UTR already used" };
  }

  if (pendingDeposits.length !== 1) {
    return {
      ok: true,
      data: {
        credited: false,
        reviewRequired: true,
        reason: pendingDeposits.length > 1 ? "Multiple pending deposits matched amount" : "No pending deposit matched amount",
        amount: normalizedAmount,
        utr: normalizedUtr,
        matchedCount: pendingDeposits.length
      }
    };
  }

  const matched = pendingDeposits[0];
  const note = [
    `UPI App: ${normalizedAppName}`,
    "Client Status: AUTO_NOTIFICATION",
    `UTR: ${normalizedUtr}`,
    raw ? `Raw: ${raw.slice(0, 260)}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  await updateWalletEntryAdmin(matched.id, { note, referenceId: matched.referenceId });
  const approved = await resolveWalletApprovalRequest(matched.id, "approve");
  return {
    ok: true,
    data: {
      credited: Boolean(approved?.request),
      amount: normalizedAmount,
      utr: normalizedUtr,
      request: approved?.request || null
    }
  };
}

export async function resolveCheckoutSession({ paymentOrderId, checkoutToken }) {
  const paymentOrder = await findPaymentOrderForCheckout(paymentOrderId, checkoutToken);
  if (!paymentOrder) {
    return { ok: false, status: 404, error: "Invalid payment link" };
  }

  const user = await findUserById(paymentOrder.userId);
  return { ok: true, data: { paymentOrder, user } };
}

export async function completeCheckoutSession({ paymentOrderId, checkoutToken, payload }) {
  const paymentOrder = await findPaymentOrderForCheckout(paymentOrderId, checkoutToken);
  if (!paymentOrder) {
    return { ok: false, status: 404, error: "Payment session invalid" };
  }

  if (!payload?.razorpayPaymentId || !payload?.razorpayOrderId || !payload?.razorpaySignature) {
    return { ok: false, status: 400, error: "Payment confirmation payload is incomplete", data: { paymentOrder } };
  }

  const updatedOrder = await completePaymentOrder({
    paymentOrderId: paymentOrder.id,
    gatewayOrderId: payload.razorpayOrderId,
    gatewayPaymentId: payload.razorpayPaymentId,
    gatewaySignature: payload.razorpaySignature
  });

  return { ok: true, data: { paymentOrder: updatedOrder ?? paymentOrder } };
}

export async function processPaymentWebhook({ event, paymentOrderId, reference, gatewayOrderId, gatewayPaymentId, gatewaySignature }) {
  if (event === "payment_link.paid") {
    const updated = await completePaymentLinkOrder({
      reference,
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature
    });

    if (!updated) {
      return { ok: false, status: 404, error: "Payment link order not found" };
    }

    return { ok: true, data: { received: true, event, status: "SUCCESS", order: updated } };
  }

  if (event === "payment.failed") {
    const updated = await handlePaymentWebhook({
      paymentOrderId,
      reference,
      gatewayOrderId,
      status: "FAILED"
    });
    if (!updated) {
      return { ok: false, status: 404, error: "Payment order not found" };
    }
    return { ok: true, data: { received: true, event, status: "FAILED", order: updated } };
  }

  if (event === "payment_link.cancelled") {
    const updated = await handlePaymentWebhook({
      paymentOrderId,
      reference,
      gatewayOrderId,
      status: "CANCELLED"
    });
    if (!updated) {
      return { ok: false, status: 404, error: "Payment order not found" };
    }
    return { ok: true, data: { received: true, event, status: "CANCELLED", order: updated } };
  }

  if (event === "payment_link.expired") {
    const updated = await handlePaymentWebhook({
      paymentOrderId,
      reference,
      gatewayOrderId,
      status: "EXPIRED"
    });
    if (!updated) {
      return { ok: false, status: 404, error: "Payment order not found" };
    }
    return { ok: true, data: { received: true, event, status: "EXPIRED", order: updated } };
  }

  return { ok: true, data: { received: true, event, status: "IGNORED" } };
}
