export type PaymentStage =
  | "IDLE"
  | "SESSION_CREATING"
  | "READY_TO_REDIRECT"
  | "REDIRECTING"
  | "RETURNED_FROM_APP"
  | "SUBMITTED"
  | "FAILED"
  | "CANCELLED";

export type PreferredUpiTarget = "googlePay" | "phonePe" | "paytm" | "generic";

export type DepositSessionInput = {
  amount: number;
  upiId: string;
  referenceId: string;
  payerLabel?: string;
  note?: string;
  preferredTarget?: PreferredUpiTarget;
};

export type DepositSessionRecord = {
  channel: "UPI_INTENT";
  stage: PaymentStage;
  amount: number;
  referenceId: string;
  upiId: string;
  launchUrl: string;
  fallbackUrl: string;
  preferredTarget: PreferredUpiTarget;
};

const PACKAGE_BY_TARGET: Record<Exclude<PreferredUpiTarget, "generic">, string> = {
  googlePay: "com.google.android.apps.nbu.paisa.user",
  phonePe: "com.phonepe.app",
  paytm: "net.one97.paytm"
};

const ALLOWED_TRANSITIONS: Record<PaymentStage, PaymentStage[]> = {
  IDLE: ["SESSION_CREATING"],
  SESSION_CREATING: ["READY_TO_REDIRECT", "FAILED"],
  READY_TO_REDIRECT: ["REDIRECTING", "FAILED"],
  REDIRECTING: ["RETURNED_FROM_APP", "FAILED", "CANCELLED"],
  RETURNED_FROM_APP: ["SUBMITTED", "FAILED", "CANCELLED"],
  SUBMITTED: [],
  FAILED: [],
  CANCELLED: []
};

export function buildReferenceId() {
  return `RM${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`.slice(0, 12);
}

export function isSafeUpiId(value: string) {
  return /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/i.test(String(value || "").trim());
}

export function sanitizeAmount(amount: number) {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  return Math.round(numeric * 100) / 100;
}

export function buildUpiQuery(input: DepositSessionInput) {
  const amount = sanitizeAmount(input.amount);
  const upiId = String(input.upiId || "").trim();
  if (!isSafeUpiId(upiId)) {
    throw new Error("UPI ID format looks invalid.");
  }

  const params = new URLSearchParams();
  params.set("pa", upiId);

  const payerLabel = String(input.payerLabel || "").trim();
  if (payerLabel) {
    params.set("pn", payerLabel);
  }

  params.set("am", amount.toFixed(2));
  params.set("cu", "INR");

  return params;
}

export function buildReadableUpiPreview(input: DepositSessionInput) {
  const amount = sanitizeAmount(input.amount);
  const upiId = String(input.upiId || "").trim();
  const payerLabel = String(input.payerLabel || "").trim();
  const parts = [`pa=${upiId}`];

  if (payerLabel) {
    parts.push(`pn=${payerLabel}`);
  }

  parts.push(`am=${amount.toFixed(2)}`);
  parts.push("cu=INR");

  return `upi://pay?${parts.join("&")}`;
}

export function buildGenericUpiUrl(input: DepositSessionInput) {
  return `upi://pay?${buildUpiQuery(input).toString()}`;
}

export function buildTargetedUpiUrl(input: DepositSessionInput, target: PreferredUpiTarget) {
  const genericUrl = buildGenericUpiUrl(input);
  if (target === "generic") {
    return genericUrl;
  }

  const packageName = PACKAGE_BY_TARGET[target];
  return `intent://pay?${buildUpiQuery(input).toString()}#Intent;scheme=upi;package=${packageName};end`;
}

export function createDepositSession(input: DepositSessionInput): DepositSessionRecord {
  const preferredTarget = input.preferredTarget || "googlePay";
  return {
    channel: "UPI_INTENT",
    stage: "READY_TO_REDIRECT",
    amount: sanitizeAmount(input.amount),
    referenceId: String(input.referenceId || "").trim(),
    upiId: String(input.upiId || "").trim(),
    launchUrl: buildTargetedUpiUrl(input, preferredTarget),
    fallbackUrl: buildGenericUpiUrl(input),
    preferredTarget
  };
}

export function canTransition(from: PaymentStage, to: PaymentStage) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function nextSessionStage(session: DepositSessionRecord, nextStage: PaymentStage): DepositSessionRecord {
  if (!canTransition(session.stage, nextStage)) {
    throw new Error(`Invalid payment stage transition: ${session.stage} -> ${nextStage}`);
  }
  return { ...session, stage: nextStage };
}

export function buildSubmittedPayload(session: DepositSessionRecord) {
  return {
    referenceId: session.referenceId,
    appName: "SAFE_PROCESSOR",
    appReportedStatus: "SUBMITTED" as const,
    rawResponse: "app_returned"
  };
}
